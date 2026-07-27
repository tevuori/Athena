// ===== Study Hub: persistent user highlights & annotations =====
// CRUD for StudyHighlight entities + an export endpoint that builds a Note
// from a selection of highlights. Mounted at /api/study/highlights.

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";

const highlights = new Hono();
highlights.use("*", authMiddleware);

const COLOR_ENUM = z.enum(["yellow", "green", "blue", "pink", "purple"]);

function serialize(h: any) {
  return {
    id: h.id,
    scope: h.scope,
    scopeId: h.scopeId,
    contentKey: h.contentKey,
    text: h.text,
    contextBefore: h.contextBefore,
    contextAfter: h.contextAfter,
    color: h.color,
    annotation: h.annotation,
    sourceName: h.sourceName,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

/** GET / — list the user's highlights.
 *  Optional filters: ?scope=, ?scopeId=, ?contentKey= */
highlights.get("/", async (c) => {
  const { userId } = c.get("auth");
  const scope = c.req.query("scope");
  const scopeId = c.req.query("scopeId");
  const contentKey = c.req.query("contentKey");
  const where: any = { userId };
  if (scope) where.scope = scope;
  if (scopeId) where.scopeId = scopeId;
  if (contentKey) where.contentKey = contentKey;
  const rows = await prisma.studyHighlight.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return c.json({ highlights: rows.map(serialize) });
});

const createSchema = z.object({
  scope: z.string().min(1).max(40),
  scopeId: z.string().min(1).max(200),
  contentKey: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
  contextBefore: z.string().max(200).default(""),
  contextAfter: z.string().max(200).default(""),
  color: COLOR_ENUM.optional().default("yellow"),
  annotation: z.string().max(4000).optional(),
  sourceName: z.string().max(200).optional(),
});

/** POST / — create a highlight. */
highlights.post("/", zValidator("json", createSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const created = await prisma.studyHighlight.create({
    data: {
      userId,
      scope: body.scope,
      scopeId: body.scopeId,
      contentKey: body.contentKey,
      text: body.text.slice(0, 4000),
      contextBefore: body.contextBefore.slice(0, 200),
      contextAfter: body.contextAfter.slice(0, 200),
      color: body.color,
      annotation: body.annotation?.slice(0, 4000) ?? null,
      sourceName: body.sourceName?.slice(0, 200) ?? null,
    },
  });
  return c.json({ highlight: serialize(created) }, 201);
});

const patchSchema = z.object({
  color: COLOR_ENUM.optional(),
  annotation: z.string().max(4000).nullable().optional(),
});

/** PATCH /:id — update color and/or annotation. */
highlights.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const h = await prisma.studyHighlight.findFirst({
    where: { id: c.req.param("id"), userId },
  });
  if (!h) return c.json({ error: "Highlight not found" }, 404);
  const data: any = {};
  if (body.color !== undefined) data.color = body.color;
  if (body.annotation !== undefined) data.annotation = body.annotation?.slice(0, 4000) ?? null;
  const updated = await prisma.studyHighlight.update({ where: { id: h.id }, data });
  return c.json({ highlight: serialize(updated) });
});

/** DELETE /:id — delete a highlight. */
highlights.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const h = await prisma.studyHighlight.findFirst({
    where: { id: c.req.param("id"), userId },
  });
  if (!h) return c.json({ error: "Highlight not found" }, 404);
  await prisma.studyHighlight.delete({ where: { id: h.id } });
  return c.json({ ok: true });
});

const exportSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  title: z.string().max(200).optional(),
});

/** POST /export — build a Note from a selection of highlights.
 *  Renders each highlight as a markdown blockquote with its color, annotation,
 *  and source label. Returns the created note id. */
highlights.post("/export", zValidator("json", exportSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const rows = await prisma.studyHighlight.findMany({
    where: { id: { in: body.ids }, userId },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return c.json({ error: "No highlights found" }, 404);

  const lines: string[] = [];
  lines.push(`# ${body.title?.trim() || "Highlights"}`);
  lines.push("");
  lines.push(`_Exported ${new Date().toLocaleString()} — ${rows.length} highlights_`);
  lines.push("");
  for (const h of rows) {
    lines.push(`## ${h.sourceName ?? h.scope}`);
    lines.push("");
    lines.push(`> ${h.text.replace(/\n/g, "\n> ")}`);
    lines.push("");
    const meta: string[] = [`Color: **${h.color}**`];
    if (h.annotation) meta.push(`Annotation: ${h.annotation}`);
    if (h.sourceName) meta.push(`Source: ${h.sourceName}`);
    lines.push(meta.join(" · "));
    lines.push("");
  }
  const content = lines.join("\n");
  const note = await prisma.note.create({
    data: {
      userId,
      title: (body.title?.trim() || "Highlights").slice(0, 200),
      content,
      tags: "highlights,study",
    },
  });
  return c.json({ noteId: note.id });
});

export default highlights;

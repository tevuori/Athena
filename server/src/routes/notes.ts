import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { cleanupOrphanLinks } from "../db/links";

const notes = new Hono();
notes.use("*", authMiddleware);

// ---------- Folders ----------
const folderSchema = z.object({
  name: z.string().min(1).max(64),
  parentId: z.string().nullable().optional(),
  position: z.number().int().optional().default(0),
});

notes.get("/folders", async (c) => {
  const { userId } = c.get("auth");
  const folders = await prisma.noteFolder.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return c.json({ folders });
});

notes.post("/folders", zValidator("json", folderSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const folder = await prisma.noteFolder.create({
    data: { ...body, userId, parentId: body.parentId ?? null },
  });
  return c.json({ folder }, 201);
});

notes.patch("/folders/:id", zValidator("json", folderSchema.partial()), async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const folder = await prisma.noteFolder.update({
    where: { id, userId },
    data: body,
  });
  return c.json({ folder });
});

notes.delete("/folders/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  await prisma.noteFolder.delete({ where: { id, userId } });
  return c.json({ ok: true });
});

// ---------- Notes ----------
const noteSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().optional(),
  tags: z.string().optional(),
  folderId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

notes.get("/", async (c) => {
  const { userId } = c.get("auth");
  const q = c.req.query("q");
  const folderId = c.req.query("folderId");
  const where: Record<string, unknown> = { userId };
  if (folderId) where.folderId = folderId === "null" ? null : folderId;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { content: { contains: q } },
      { tags: { contains: q } },
    ];
  }
  const list = await prisma.note.findMany({
    where: where as never,
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
  return c.json({ notes: list });
});

notes.get("/:id", async (c) => {
  const { userId } = c.get("auth");
  const note = await prisma.note.findFirst({ where: { id: c.req.param("id"), userId } });
  if (!note) return c.json({ error: "Not found" }, 404);
  return c.json({ note });
});

notes.post("/", zValidator("json", noteSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const note = await prisma.note.create({
    data: { ...body, userId, folderId: body.folderId ?? null } as never,
  });
  return c.json({ note }, 201);
});

notes.patch("/:id", zValidator("json", noteSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const note = await prisma.note.update({
    where: { id: c.req.param("id"), userId },
    data: body as never,
  });
  return c.json({ note });
});

notes.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  await prisma.note.delete({ where: { id, userId } });
  await cleanupOrphanLinks(userId, "note", id);
  return c.json({ ok: true });
});

export default notes;

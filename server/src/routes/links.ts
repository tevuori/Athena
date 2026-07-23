import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import {
  canonicalPair,
  isLinkType,
  resolveLinkTitle,
  LINK_TYPES,
} from "../db/links";

const links = new Hono();
links.use("*", authMiddleware);

const linkTypeSchema = z.enum(LINK_TYPES as unknown as [string, ...string[]]);

const createSchema = z.object({
  srcType: linkTypeSchema,
  srcId: z.string().min(1),
  dstType: linkTypeSchema,
  dstId: z.string().min(1),
});

/** GET /api/links?type=&id= — resolved links for an item (both directions). */
links.get("/", async (c) => {
  const { userId } = c.get("auth");
  const type = c.req.query("type") ?? "";
  const id = c.req.query("id") ?? "";
  if (!isLinkType(type) || !id) {
    return c.json({ error: "type and id query params required" }, 400);
  }
  const rows = await prisma.itemLink.findMany({
    where: {
      userId,
      OR: [
        { srcType: type, srcId: id },
        { dstType: type, dstId: id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve the "other" side of each link and drop orphans.
  const resolved = await Promise.all(
    rows.map(async (r) => {
      const isSrc = r.srcType === type && r.srcId === id;
      const otherType = isSrc ? r.dstType : r.srcType;
      const otherId = isSrc ? r.dstId : r.srcId;
      const title = await resolveLinkTitle(userId, otherType, otherId);
      if (!title) return null;
      return {
        id: r.id,
        type: otherType,
        refId: otherId,
        title,
      };
    })
  );
  return c.json({ links: resolved.filter(Boolean) });
});

/** POST /api/links — create a symmetric link (deduped, canonicalized). */
links.post("/", zValidator("json", createSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  if (body.srcType === body.dstType && body.srcId === body.dstId) {
    return c.json({ error: "Cannot link an item to itself" }, 400);
  }
  const pair = canonicalPair(
    { type: body.srcType, id: body.srcId },
    { type: body.dstType, id: body.dstId }
  );
  // upsert against the unique constraint
  const link = await prisma.itemLink.upsert({
    where: {
      userId_srcType_srcId_dstType_dstId: {
        userId,
        ...pair,
      },
    },
    update: {},
    create: { userId, ...pair },
  });
  return c.json({ link }, 201);
});

/** DELETE /api/links/:id — remove a single link row. */
links.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  await prisma.itemLink.delete({ where: { id: c.req.param("id"), userId } });
  return c.json({ ok: true });
});

export default links;

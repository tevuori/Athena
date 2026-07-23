// ===== Whiteboard (vector drawing canvas) =====
// CRUD for Whiteboard rows. The `content` field is a JSON string holding the
// array of vector elements drawn on the canvas (paths, shapes, text, images).

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";

const whiteboards = new Hono();
whiteboards.use("*", authMiddleware);

const createSchema = z.object({
  name: z.string().min(1).max(120).optional().default("Untitled"),
  content: z.string().optional().default("[]"),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  content: z.string().optional(),
});

// List the user's whiteboards (without heavy content payload).
whiteboards.get("/", async (c) => {
  const { userId } = c.get("auth");
  const list = await prisma.whiteboard.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return c.json({ whiteboards: list });
});

// Create a new whiteboard.
whiteboards.post("/", zValidator("json", createSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const wb = await prisma.whiteboard.create({
    data: { ...body, userId },
  });
  return c.json({ whiteboard: wb }, 201);
});

// Get a single whiteboard (with content).
whiteboards.get("/:id", async (c) => {
  const { userId } = c.get("auth");
  const wb = await prisma.whiteboard.findFirst({
    where: { id: c.req.param("id"), userId },
  });
  if (!wb) return c.json({ error: "Whiteboard not found" }, 404);
  return c.json({ whiteboard: wb });
});

// Update name and/or content.
whiteboards.put("/:id", zValidator("json", updateSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const wb = await prisma.whiteboard.update({
    where: { id: c.req.param("id"), userId },
    data: body,
  });
  return c.json({ whiteboard: wb });
});

whiteboards.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  await prisma.whiteboard.delete({ where: { id: c.req.param("id"), userId } });
  return c.json({ ok: true });
});

export default whiteboards;

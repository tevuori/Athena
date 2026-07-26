// ===== Task workspaces =====
// Named project spaces that group tasks. Each user gets a "Default" workspace
// on migration; they can create more to separate projects. Deleting a workspace
// cascades to all its tasks. Mounted at /api/task-workspaces.

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";

const taskWorkspaces = new Hono();
taskWorkspaces.use("*", authMiddleware);

const wsSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(20).optional().default("#6366f1"),
});

/** GET / — list the user's task workspaces with task counts. */
taskWorkspaces.get("/", async (c) => {
  const { userId } = c.get("auth");
  const workspaces = await prisma.taskWorkspace.findMany({
    where: { userId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: "asc" },
  });
  return c.json({
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      taskCount: w._count.tasks,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
  });
});

/** POST / — create a new task workspace. */
taskWorkspaces.post("/", zValidator("json", wsSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  try {
    const ws = await prisma.taskWorkspace.create({
      data: { ...body, userId },
    });
    return c.json({ workspace: ws }, 201);
  } catch {
    return c.json({ error: "A workspace with that name already exists." }, 409);
  }
});

/** PATCH /:id — rename or recolor a workspace. */
taskWorkspaces.patch("/:id", zValidator("json", wsSchema.partial()), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  try {
    const ws = await prisma.taskWorkspace.update({
      where: { id: c.req.param("id"), userId },
      data: body,
    });
    return c.json({ workspace: ws });
  } catch {
    return c.json({ error: "Workspace not found or name conflict." }, 404);
  }
});

/** DELETE /:id — delete a workspace and cascade all its tasks. */
taskWorkspaces.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const ws = await prisma.taskWorkspace.findUnique({ where: { id, userId } });
  if (!ws) return c.json({ error: "Workspace not found" }, 404);
  await prisma.taskWorkspace.delete({ where: { id, userId } });
  return c.json({ ok: true, deletedTaskCount: true });
});

export default taskWorkspaces;

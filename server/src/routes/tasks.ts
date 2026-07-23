import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { cleanupOrphanLinks } from "../db/links";

const tasks = new Hono();
tasks.use("*", authMiddleware);

const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  recurring: z.string().optional().default(""),
  order: z.number().int().optional().default(0),
});

tasks.get("/", async (c) => {
  const { userId } = c.get("auth");
  const list = await prisma.task.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { order: "asc" }, { createdAt: "desc" }],
  });
  return c.json({ tasks: list });
});

tasks.post("/", zValidator("json", taskSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const task = await prisma.task.create({
    data: {
      ...body,
      userId,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    } as never,
  });
  return c.json({ task }, 201);
});

tasks.patch("/:id", zValidator("json", taskSchema.partial()), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const task = await prisma.task.update({
    where: { id: c.req.param("id"), userId },
    data: {
      ...body,
      dueDate: body.dueDate === null ? null : body.dueDate ? new Date(body.dueDate) : undefined,
    } as never,
  });
  return c.json({ task });
});

tasks.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  await prisma.task.delete({ where: { id, userId } });
  await cleanupOrphanLinks(userId, "task", id);
  return c.json({ ok: true });
});

export default tasks;

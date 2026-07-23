import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";
import { countLinksBatch } from "../../../db/links";

export const taskTools: ToolDef[] = [
  {
    name: "create_task",
    description:
      "Create a new todo task. Use when the user asks to add a task, reminder, or to-do item.",
    parameters: [
      { name: "title", type: "string", description: "Short task title", required: true },
      { name: "description", type: "string", description: "Longer description / notes" },
      {
        name: "priority",
        type: "string",
        description: "Priority level",
        enum: ["LOW", "MEDIUM", "HIGH"],
      },
      { name: "dueDate", type: "string", description: "ISO 8601 datetime (e.g. 2026-08-01T09:00:00Z)" },
    ],
    handler: async (args, { userId }) => {
      const task = await prisma.task.create({
        data: {
          userId,
          title: String(args.title ?? "").slice(0, 200),
          description: String(args.description ?? ""),
          priority: (args.priority as any) ?? "MEDIUM",
          dueDate: args.dueDate ? new Date(args.dueDate) : null,
        },
      });
      return { task, created: true };
    },
  },
  {
    name: "list_tasks",
    description:
      "List the user's tasks. Optionally filter by status. Returns id, title, status, priority, dueDate.",
    parameters: [
      {
        name: "status",
        type: "string",
        description: "Filter by status",
        enum: ["TODO", "IN_PROGRESS", "DONE"],
      },
    ],
    handler: async (args, { userId }) => {
      const where: Record<string, unknown> = { userId };
      if (args.status) where.status = args.status;
      const tasks = await prisma.task.findMany({
        where: where as never,
        orderBy: [{ status: "asc" }, { order: "asc" }, { createdAt: "desc" }],
        take: 50,
      });
      const linkCounts = await countLinksBatch(userId, "task", tasks.map((t) => t.id));
      return {
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() ?? null,
          description: t.description,
          linkCount: linkCounts.get(t.id) ?? 0,
        })),
      };
    },
  },
  {
    name: "update_task_status",
    description: "Move a task to a different status (TODO / IN_PROGRESS / DONE).",
    destructive: true,
    parameters: [
      { name: "taskId", type: "string", description: "Task id from list_tasks", required: true },
      {
        name: "status",
        type: "string",
        description: "New status",
        enum: ["TODO", "IN_PROGRESS", "DONE"],
        required: true,
      },
    ],
    handler: async (args, { userId }) => {
      const task = await prisma.task.update({
        where: { id: String(args.taskId), userId },
        data: { status: args.status as any },
      });
      return { task, updated: true };
    },
  },
  {
    name: "delete_task",
    description: "Delete a task permanently. Use when the user asks to remove or delete a task.",
    destructive: true,
    parameters: [
      { name: "taskId", type: "string", description: "Task id from list_tasks", required: true },
    ],
    handler: async (args, { userId }) => {
      const id = String(args.taskId);
      const task = await prisma.task.findUnique({ where: { id, userId } });
      if (!task) return { error: "Task not found" };
      await prisma.task.delete({ where: { id, userId } });
      return { deleted: true, taskId: id, title: task.title };
    },
  },
];

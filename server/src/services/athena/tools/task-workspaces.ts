// ===== Athena task workspace tools =====
// list_task_workspaces, create_task_workspace, delete_task_workspace, move_task.
// Lets the Athena chat assistant manage task workspaces (project spaces) and
// move tasks between them.

import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";

export const taskWorkspaceTools: ToolDef[] = [
  {
    name: "list_task_workspaces",
    description:
      "List the user's task workspaces (project spaces) with task counts. Use to find a workspace id before creating tasks in it or moving tasks to it. Each task belongs to exactly one workspace.",
    parameters: [],
    handler: async (_args, { userId }) => {
      const workspaces = await prisma.taskWorkspace.findMany({
        where: { userId },
        include: { _count: { select: { tasks: true } } },
        orderBy: { createdAt: "asc" },
      });
      return {
        count: workspaces.length,
        workspaces: workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          color: w.color,
          taskCount: w._count.tasks,
        })),
      };
    },
  },
  {
    name: "create_task_workspace",
    description:
      "Create a new task workspace (project space) to group related tasks. Use when the user starts a new project and wants its tasks separate from other projects.",
    destructive: true,
    parameters: [
      { name: "name", type: "string", description: "Workspace name (e.g. 'Thesis', 'Side Project')", required: true },
      { name: "color", type: "string", description: "Optional hex color (e.g. '#ec4899')" },
    ],
    handler: async (args, { userId }) => {
      const name = String(args.name ?? "").trim().slice(0, 100);
      if (!name) return { error: "Workspace name is required." };
      const color = String(args.color ?? "#6366f1").slice(0, 20);
      try {
        const ws = await prisma.taskWorkspace.create({
          data: { name, color, userId },
        });
        return { workspace: { id: ws.id, name: ws.name, color: ws.color }, created: true };
      } catch {
        return { error: `A workspace named "${name}" already exists.` };
      }
    },
  },
  {
    name: "delete_task_workspace",
    description:
      "Delete a task workspace AND all tasks in it permanently. This cannot be undone. Use list_task_workspaces first to get the workspace id. Only use when the user explicitly asks to delete a workspace/project.",
    destructive: true,
    parameters: [
      { name: "workspaceId", type: "string", description: "Workspace id from list_task_workspaces", required: true },
    ],
    handler: async (args, { userId }) => {
      const id = String(args.workspaceId);
      const ws = await prisma.taskWorkspace.findUnique({
        where: { id, userId },
        include: { _count: { select: { tasks: true } } },
      });
      if (!ws) return { error: "Workspace not found" };
      const taskCount = ws._count.tasks;
      await prisma.taskWorkspace.delete({ where: { id, userId } });
      return { deleted: true, workspaceId: id, name: ws.name, taskCount };
    },
  },
  {
    name: "move_task",
    description:
      "Move a task to a different task workspace. Use list_tasks to get the task id and list_task_workspaces to get the destination workspace id.",
    destructive: true,
    parameters: [
      { name: "taskId", type: "string", description: "Task id from list_tasks", required: true },
      { name: "workspaceId", type: "string", description: "Destination workspace id from list_task_workspaces", required: true },
    ],
    handler: async (args, { userId }) => {
      const taskId = String(args.taskId);
      const workspaceId = String(args.workspaceId);
      // Verify workspace ownership
      const ws = await prisma.taskWorkspace.findFirst({
        where: { id: workspaceId, userId },
      });
      if (!ws) return { error: "Destination workspace not found" };
      // Verify task ownership
      const task = await prisma.task.findUnique({ where: { id: taskId, userId } });
      if (!task) return { error: "Task not found" };
      const updated = await prisma.task.update({
        where: { id: taskId, userId },
        data: { workspaceId },
      });
      return { task: { id: updated.id, title: updated.title, workspaceId: updated.workspaceId }, moved: true, toWorkspace: ws.name };
    },
  },
];

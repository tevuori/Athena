import type { ToolDef, ClientWindowInfo } from "./plugin";
import prisma from "../../../db/client";

// Workspace tools: save / open / list / delete window layouts.
// Layouts are stored as JSON in the Workspace table (per-user, unique by name).
// "save" reads the current client windows from the tool context.
// "open" is a clientAction — the client closes all windows and reopens them
// at the saved positions.

interface SavedWindowEntry {
  appId: string;
  title: string;
  rect: { x: number; y: number; width: number; height: number };
  payload?: Record<string, unknown>;
}

export const workspaceTools: ToolDef[] = [
  {
    name: "save_workspace",
    description:
      "Save the current window layout (all open windows with their positions and sizes) as a named workspace. If a workspace with that name already exists, it is overwritten. Use this when the user says 'save my workspace' or 'save this layout'.",
    destructive: true,
    parameters: [
      { name: "name", type: "string", description: "Workspace name (e.g. 'Study Mode', 'Programming')", required: true },
    ],
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Workspace name is required" };
      const wins: ClientWindowInfo[] = ctx.windows ?? [];
      if (wins.length === 0) {
        return { error: "No windows are currently open to save." };
      }
      const layout: SavedWindowEntry[] = wins.map((w) => ({
        appId: w.appId,
        title: w.title,
        rect: { x: w.rect.x, y: w.rect.y, width: w.rect.width, height: w.rect.height },
      }));
      const layoutJson = JSON.stringify(layout);
      const existing = await prisma.workspace.findUnique({
        where: { userId_name: { userId: ctx.userId, name } },
      });
      let ws;
      if (existing) {
        ws = await prisma.workspace.update({
          where: { id: existing.id },
          data: { layout: layoutJson },
        });
      } else {
        ws = await prisma.workspace.create({
          data: { userId: ctx.userId, name, layout: layoutJson },
        });
      }
      return {
        workspace: { id: ws.id, name: ws.name, windowCount: layout.length },
        saved: true,
      };
    },
  },
  {
    name: "open_workspace",
    description:
      "Open a saved workspace by name. This closes all currently open windows and reopens them at their saved positions. Use when the user says 'open my study workspace' or 'restore layout'.",
    clientAction: true,
    parameters: [
      { name: "name", type: "string", description: "Workspace name to open", required: true },
    ],
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Workspace name is required" };
      const ws = await prisma.workspace.findUnique({
        where: { userId_name: { userId: ctx.userId, name } },
      });
      if (!ws) return { error: `Workspace '${name}' not found. Use list_workspaces to see available ones.` };
      let layout: SavedWindowEntry[];
      try {
        layout = JSON.parse(ws.layout);
      } catch {
        return { error: "Workspace layout is corrupted." };
      }
      return {
        action: "open_workspace",
        name: ws.name,
        windows: layout,
      };
    },
  },
  {
    name: "list_workspaces",
    description: "List all saved workspace names with their window count and last-updated time.",
    parameters: [],
    handler: async (_args, ctx) => {
      const wss = await prisma.workspace.findMany({
        where: { userId: ctx.userId },
        orderBy: { updatedAt: "desc" },
      });
      let count: number;
      return {
        count: wss.length,
        workspaces: wss.map((w) => {
          try {
            count = JSON.parse(w.layout).length;
          } catch {
            count = 0;
          }
          return {
            id: w.id,
            name: w.name,
            windowCount: count,
            updatedAt: w.updatedAt.toISOString(),
          };
        }),
      };
    },
  },
  {
    name: "delete_workspace",
    description: "Delete a saved workspace by name.",
    destructive: true,
    parameters: [
      { name: "name", type: "string", description: "Workspace name to delete", required: true },
    ],
    handler: async (args, ctx) => {
      const name = String(args.name ?? "").trim();
      if (!name) return { error: "Workspace name is required" };
      const ws = await prisma.workspace.findUnique({
        where: { userId_name: { userId: ctx.userId, name } },
      });
      if (!ws) return { error: `Workspace '${name}' not found.` };
      await prisma.workspace.delete({ where: { id: ws.id } });
      return { name, deleted: true };
    },
  },
];

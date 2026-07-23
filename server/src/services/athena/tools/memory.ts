// ===== Athena persistent memory tools =====
// remember / recall_memory / forget_memory / list_memories.
// The 5 most recently updated memories are also injected into the system
// prompt (see context.ts) so Athena "knows" them without an explicit recall.

import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";

const VALID_CATEGORIES = ["general", "preference", "fact", "goal", "person"];
const MAX_CONTENT = 1000;

export const memoryTools: ToolDef[] = [
  {
    name: "remember",
    description:
      "Store a fact, preference, or goal the user wants you to recall in future conversations. Use when the user says 'remember that...', 'note that I prefer...', 'don't forget that...', or states a persistent fact about themselves. The stored memory will appear in your context automatically in future turns.",
    destructive: true,
    parameters: [
      { name: "content", type: "string", description: "The fact/preference/goal to remember (concise)", required: true },
      {
        name: "category",
        type: "string",
        description: "Memory category",
        enum: VALID_CATEGORIES,
      },
    ],
    handler: async (args, { userId }) => {
      const content = String(args.content ?? "").trim();
      if (!content) return { error: "content is required" };
      const category = VALID_CATEGORIES.includes(String(args.category ?? ""))
        ? String(args.category)
        : "general";
      const memory = await prisma.athenaMemory.create({
        data: { userId, content: content.slice(0, MAX_CONTENT), category },
      });
      return { memory: { id: memory.id, content: memory.content, category: memory.category }, saved: true };
    },
  },
  {
    name: "recall_memory",
    description:
      "Search your stored memories about the user by keyword or category. Returns matching memories (id, content, category, updatedAt). Use when the user asks 'do you remember...' or refers to something you might have stored.",
    parameters: [
      { name: "query", type: "string", description: "Substring to search memory content for" },
      {
        name: "category",
        type: "string",
        description: "Filter by category",
        enum: VALID_CATEGORIES,
      },
      { name: "limit", type: "number", description: "Max results (1-50, default 10)" },
    ],
    handler: async (args, { userId }) => {
      const where: Record<string, unknown> = { userId };
      if (args.category && VALID_CATEGORIES.includes(String(args.category))) {
        where.category = String(args.category);
      }
      if (args.query) where.content = { contains: String(args.query) };
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 10));
      const memories = await prisma.athenaMemory.findMany({
        where: where as never,
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
      return {
        count: memories.length,
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          updatedAt: m.updatedAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "forget_memory",
    description: "Delete a stored memory by id. Use when the user says 'forget that...' or 'remove that memory'. Use recall_memory or list_memories first to get the memory id.",
    destructive: true,
    parameters: [
      { name: "memoryId", type: "string", description: "Memory id to delete", required: true },
    ],
    handler: async (args, { userId }) => {
      const id = String(args.memoryId);
      const memory = await prisma.athenaMemory.findUnique({ where: { id, userId } });
      if (!memory) return { error: "Memory not found" };
      await prisma.athenaMemory.delete({ where: { id, userId } });
      return { deleted: true, memoryId: id, content: memory.content };
    },
  },
  {
    name: "list_memories",
    description: "List all stored memories about the user (id, content preview, category, updatedAt). Optionally filter by category.",
    parameters: [
      {
        name: "category",
        type: "string",
        description: "Filter by category",
        enum: VALID_CATEGORIES,
      },
      { name: "limit", type: "number", description: "Max results (1-100, default 20)" },
    ],
    handler: async (args, { userId }) => {
      const where: Record<string, unknown> = { userId };
      if (args.category && VALID_CATEGORIES.includes(String(args.category))) {
        where.category = String(args.category);
      }
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 20));
      const memories = await prisma.athenaMemory.findMany({
        where: where as never,
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
      return {
        count: memories.length,
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content,
          category: m.category,
          updatedAt: m.updatedAt.toISOString(),
        })),
      };
    },
  },
];

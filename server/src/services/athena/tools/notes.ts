import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";
import { countLinksBatch } from "../../../db/links";

export const noteTools: ToolDef[] = [
  {
    name: "list_notes",
    description:
      "List the user's notes (id, title, tags, pinned, updatedAt). Use to find a note before reading/summarizing it.",
    parameters: [
      { name: "search", type: "string", description: "Optional substring to filter titles by" },
    ],
    handler: async (args, { userId }) => {
      const where: Record<string, unknown> = { userId };
      if (args.search) where.title = { contains: String(args.search) };
      const notes = await prisma.note.findMany({
        where: where as never,
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        take: 50,
        select: {
          id: true,
          title: true,
          tags: true,
          pinned: true,
          updatedAt: true,
        },
      });
      const linkCounts = await countLinksBatch(userId, "note", notes.map((n) => n.id));
      return {
        count: notes.length,
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          tags: n.tags,
          pinned: n.pinned,
          updatedAt: n.updatedAt.toISOString(),
          linkCount: linkCounts.get(n.id) ?? 0,
        })),
      };
    },
  },
  {
    name: "read_note",
    description: "Read the full Markdown content of a note by id.",
    parameters: [
      { name: "noteId", type: "string", description: "Note id from list_notes", required: true },
    ],
    handler: async (args, { userId }) => {
      const note = await prisma.note.findFirst({
        where: { id: String(args.noteId), userId },
      });
      if (!note) return { error: "Note not found" };
      return {
        id: note.id,
        title: note.title,
        tags: note.tags,
        content: note.content,
      };
    },
  },
  {
    name: "create_note",
    description: "Create a new note with Markdown content.",
    destructive: true,
    parameters: [
      { name: "title", type: "string", description: "Note title", required: true },
      { name: "content", type: "string", description: "Markdown body" },
      { name: "tags", type: "string", description: "Comma-separated tags" },
    ],
    handler: async (args, { userId }) => {
      const note = await prisma.note.create({
        data: {
          userId,
          title: String(args.title ?? "Untitled").slice(0, 200),
          content: String(args.content ?? ""),
          tags: String(args.tags ?? ""),
        },
      });
      return { note: { id: note.id, title: note.title }, created: true };
    },
  },
];

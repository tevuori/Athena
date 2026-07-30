import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";
import { countLinksBatch, cleanupOrphanLinks } from "../../../db/links";

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
  {
    name: "update_note",
    description:
      "Edit an existing note. Use read_note first to see the current content. By default the provided `content` replaces the note body entirely (a full rewrite). Set mode='append' to add the content to the end of the existing body instead. Any field you omit is left unchanged. Use this when the user asks to rewrite, edit, fix, expand, or update a note.",
    destructive: true,
    parameters: [
      { name: "noteId", type: "string", description: "Note id from list_notes / read_note", required: true },
      { name: "title", type: "string", description: "New title (left unchanged if omitted)" },
      { name: "content", type: "string", description: "New Markdown body (replace mode) or text to append (append mode)" },
      {
        name: "mode",
        type: "string",
        description: "How to apply `content`: 'replace' overwrites the body (default), 'append' adds it to the end of the existing body",
        enum: ["replace", "append"],
      },
      { name: "tags", type: "string", description: "New comma-separated tags (left unchanged if omitted)" },
      { name: "pinned", type: "boolean", description: "Pin/unpin the note" },
      { name: "folderId", type: "string", description: "Move the note to this folder id (from list_notes folders). Pass null/empty string to move it to no folder" },
    ],
    handler: async (args, { userId }) => {
      const id = String(args.noteId);
      const existing = await prisma.note.findFirst({ where: { id, userId } });
      if (!existing) return { error: "Note not found" };

      const data: Record<string, unknown> = {};
      if (args.title !== undefined) data.title = String(args.title).slice(0, 200);
      if (args.tags !== undefined) data.tags = String(args.tags);
      if (args.pinned !== undefined) data.pinned = Boolean(args.pinned);
      if (args.folderId !== undefined) {
        const folderId = String(args.folderId).trim();
        if (folderId === "" || folderId === "null") {
          data.folderId = null;
        } else {
          // Verify the folder belongs to the user before moving.
          const folder = await prisma.noteFolder.findFirst({
            where: { id: folderId, userId },
          });
          if (!folder) return { error: "Folder not found" };
          data.folderId = folderId;
        }
      }
      if (args.content !== undefined) {
        const incoming = String(args.content);
        const mode = String(args.mode ?? "replace");
        data.content =
          mode === "append"
            ? `${existing.content}${existing.content.endsWith("\n") ? "" : "\n"}${incoming}`
            : incoming;
      }

      if (Object.keys(data).length === 0) {
        return { error: "No fields provided to update" };
      }

      const note = await prisma.note.update({ where: { id, userId }, data: data as never });
      return {
        note: { id: note.id, title: note.title, tags: note.tags, pinned: note.pinned },
        updated: true,
      };
    },
  },
  {
    name: "delete_note",
    description:
      "Delete a note permanently. Use when the user asks to remove or delete a note. Use list_notes first to find the note id.",
    destructive: true,
    parameters: [
      { name: "noteId", type: "string", description: "Note id from list_notes", required: true },
    ],
    handler: async (args, { userId }) => {
      const id = String(args.noteId);
      const note = await prisma.note.findFirst({ where: { id, userId } });
      if (!note) return { error: "Note not found" };
      await prisma.note.delete({ where: { id, userId } });
      await cleanupOrphanLinks(userId, "note", id);
      return { deleted: true, noteId: id, title: note.title };
    },
  },
];

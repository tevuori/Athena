import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";
import {
  canonicalPair,
  isLinkType,
  resolveLinkTitle,
  LINK_TYPES,
} from "../../../db/links";

export const linkTools: ToolDef[] = [
  {
    name: "list_links",
    description:
      "List items linked/attached to a given workspace item (note, task, flashcardDeck, calendarEvent, file). Links are symmetric. Returns each attached item's id, type, and title.",
    parameters: [
      {
        name: "type",
        type: "string",
        description: "Entity type of the item to look up",
        enum: [...LINK_TYPES],
        required: true,
      },
      { name: "id", type: "string", description: "Entity id", required: true },
    ],
    handler: async (args, { userId }) => {
      const type = String(args.type ?? "");
      const id = String(args.id ?? "");
      if (!isLinkType(type)) return { error: `Invalid type: ${type}` };
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
      const resolved = await Promise.all(
        rows.map(async (r) => {
          const isSrc = r.srcType === type && r.srcId === id;
          const otherType = isSrc ? r.dstType : r.srcType;
          const otherId = isSrc ? r.dstId : r.srcId;
          const title = await resolveLinkTitle(userId, otherType, otherId);
          if (!title) return null;
          return { linkId: r.id, type: otherType, refId: otherId, title };
        })
      );
      return { count: resolved.filter(Boolean).length, links: resolved.filter(Boolean) };
    },
  },
  {
    name: "link_items",
    description:
      "Create a symmetric link/attachment between two workspace items (e.g. attach a note to a task, or a flashcard deck to a calendar event). Deduped — linking an already-linked pair is a no-op.",
    destructive: true,
    parameters: [
      { name: "srcType", type: "string", description: "Entity type of first item", enum: [...LINK_TYPES], required: true },
      { name: "srcId", type: "string", description: "Entity id of first item", required: true },
      { name: "dstType", type: "string", description: "Entity type of second item", enum: [...LINK_TYPES], required: true },
      { name: "dstId", type: "string", description: "Entity id of second item", required: true },
    ],
    handler: async (args, { userId }) => {
      const srcType = String(args.srcType ?? "");
      const dstType = String(args.dstType ?? "");
      if (!isLinkType(srcType) || !isLinkType(dstType)) {
        return { error: "Invalid entity type" };
      }
      const srcId = String(args.srcId);
      const dstId = String(args.dstId);
      if (srcType === dstType && srcId === dstId) {
        return { error: "Cannot link an item to itself" };
      }
      const pair = canonicalPair({ type: srcType, id: srcId }, { type: dstType, id: dstId });
      const link = await prisma.itemLink.upsert({
        where: { userId_srcType_srcId_dstType_dstId: { userId, ...pair } },
        update: {},
        create: { userId, ...pair },
      });
      return { link, linked: true };
    },
  },
  {
    name: "unlink_items",
    description:
      "Remove a link/attachment between two workspace items. Provide either a linkId (from list_links) OR both items (type+id) of the pair.",
    destructive: true,
    parameters: [
      { name: "linkId", type: "string", description: "Link id from list_links (preferred)" },
      { name: "aType", type: "string", description: "Entity type of first item", enum: [...LINK_TYPES] },
      { name: "aId", type: "string", description: "Entity id of first item" },
      { name: "bType", type: "string", description: "Entity type of second item", enum: [...LINK_TYPES] },
      { name: "bId", type: "string", description: "Entity id of second item" },
    ],
    handler: async (args, { userId }) => {
      if (args.linkId) {
        await prisma.itemLink.delete({ where: { id: String(args.linkId), userId } });
        return { unlinked: true };
      }
      if (args.aType && args.aId && args.bType && args.bId) {
        const pair = canonicalPair(
          { type: String(args.aType), id: String(args.aId) },
          { type: String(args.bType), id: String(args.bId) }
        );
        await prisma.itemLink.deleteMany({ where: { userId, ...pair } });
        return { unlinked: true };
      }
      return { error: "Provide linkId, or both items (aType+aId + bType+bId)" };
    },
  },
];

// Helpers for the generic ItemLink relation (drag-to-link between apps).
// Links are polymorphic (no FK to the referenced entity tables), so when an
// entity is deleted we must manually remove any link rows that reference it
// in either the src or dst position.

import prisma from "./client";

/** Supported linkable entity types. */
export const LINK_TYPES = [
  "note",
  "task",
  "flashcardDeck",
  "calendarEvent",
  "file",
  "studySource",
  "studyChat",
  "podcast",
] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(s: string): s is LinkType {
  return (LINK_TYPES as readonly string[]).includes(s);
}

/**
 * Canonicalize the (src,dst) ordering of a link so that the same logical
 * pair always produces the same row — this lets the unique constraint on
 * [userId, srcType, srcId, dstType, dstId] prevent A-B / B-A duplicates.
 * Ordering is lexicographic by `${type}:${id}`.
 */
export function canonicalPair(
  a: { type: string; id: string },
  b: { type: string; id: string }
): { srcType: string; srcId: string; dstType: string; dstId: string } {
  const ka = `${a.type}:${a.id}`;
  const kb = `${b.type}:${b.id}`;
  if (ka <= kb) {
    return { srcType: a.type, srcId: a.id, dstType: b.type, dstId: b.id };
  }
  return { srcType: b.type, srcId: b.id, dstType: a.type, dstId: a.id };
}

/**
 * Delete every link row that references the given entity (in either src or
 * dst position). Called from each entity's delete route.
 */
export async function cleanupOrphanLinks(
  userId: string,
  type: string,
  id: string
): Promise<void> {
  await prisma.itemLink.deleteMany({
    where: {
      userId,
      OR: [
        { srcType: type, srcId: id },
        { dstType: type, dstId: id },
      ],
    },
  });
}

/**
 * Resolve the human-readable title for a linked entity. Returns null if the
 * entity no longer exists (orphan link) so callers can filter/skip it.
 */
export async function resolveLinkTitle(
  userId: string,
  type: string,
  id: string
): Promise<string | null> {
  switch (type) {
    case "note": {
      const n = await prisma.note.findFirst({
        where: { id, userId },
        select: { title: true },
      });
      return n ? n.title || "Untitled" : null;
    }
    case "task": {
      const t = await prisma.task.findFirst({
        where: { id, userId },
        select: { title: true },
      });
      return t ? t.title : null;
    }
    case "flashcardDeck": {
      const d = await prisma.flashcardDeck.findFirst({
        where: { id, userId },
        select: { name: true },
      });
      return d ? d.name : null;
    }
    case "calendarEvent": {
      const e = await prisma.calendarEvent.findFirst({
        where: { id, userId },
        select: { title: true },
      });
      return e ? e.title : null;
    }
    case "file": {
      const f = await prisma.vFile.findFirst({
        where: { id, userId },
        select: { name: true },
      });
      return f ? f.name : null;
    }
    case "studySource": {
      const s = await prisma.studySource.findFirst({
        where: { id, userId },
        select: { name: true },
      });
      return s ? s.name : null;
    }
    case "studyChat": {
      const c = await prisma.studyChat.findFirst({
        where: { id, userId },
        select: { title: true },
      });
      return c ? c.title : null;
    }
    case "podcast": {
      const p = await prisma.podcast.findFirst({
        where: { id, userId },
        select: { title: true },
      });
      return p ? p.title : null;
    }
    default:
      return null;
  }
}

/**
 * Count links for a batch of entity ids of a single type. Returns a Map of
 * id → link count (links where the id appears in either src or dst position).
 * Used to enrich list_notes / list_tasks with link counts.
 */
export async function countLinksBatch(
  userId: string,
  type: string,
  ids: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await prisma.itemLink.findMany({
    where: {
      userId,
      OR: [
        { srcType: type, srcId: { in: ids } },
        { dstType: type, dstId: { in: ids } },
      ],
    },
    select: { srcType: true, srcId: true, dstType: true, dstId: true },
  });
  for (const r of rows) {
    if (r.srcType === type && ids.includes(r.srcId)) {
      counts.set(r.srcId, (counts.get(r.srcId) ?? 0) + 1);
    }
    if (r.dstType === type && ids.includes(r.dstId)) {
      counts.set(r.dstId, (counts.get(r.dstId) ?? 0) + 1);
    }
  }
  return counts;
}


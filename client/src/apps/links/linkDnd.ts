// Cross-window drag-to-link transport helpers.
//
// Reuses the native HTML5 drag-and-drop API (which already works across
// overlapping windows in this desktop shell — see the existing
// `text/file-id` / `text/task-id` pattern in Files + Calendar).
//
// We introduce a single structured MIME payload `application/athena-link`
// carrying { type, id, title }, AND keep a backward-compatible
// `text/<type>-id` key so existing drop handlers keep working.

import type { LinkType } from "../../types";

export const LINK_MIME = "application/athena-link";

export interface LinkPayload {
  type: LinkType;
  id: string;
  title: string;
}

export const LINKABLE_TYPES: LinkType[] = [
  "note",
  "task",
  "flashcardDeck",
  "calendarEvent",
  "file",
];

/** Legacy `text/<type>-id` key used by older drop handlers (files, calendar). */
export function legacyKey(type: LinkType): string {
  return `text/${type}-id`;
}

/** Set the link payload on a drag start event (call from onDragStart). */
export function setLinkPayload(
  e: React.DragEvent,
  payload: LinkPayload
): void {
  const json = JSON.stringify(payload);
  try {
    e.dataTransfer.setData(LINK_MIME, json);
  } catch {
    // Some browsers restrict custom MIME types; fall back to text/plain.
    e.dataTransfer.setData("text/plain", json);
  }
  // Backward-compatible legacy key.
  e.dataTransfer.setData(legacyKey(payload.type), payload.id);
  e.dataTransfer.effectAllowed = "link";
}

/**
 * Read a link payload from a drop event. Returns null if no link payload is
 * present (so non-link drags — e.g. internal @dnd-kit — are ignored).
 */
export function readLinkPayload(e: React.DragEvent): LinkPayload | null {
  // Prefer the structured MIME.
  let raw: string | undefined;
  try {
    raw = e.dataTransfer.getData(LINK_MIME) || undefined;
  } catch {
    raw = undefined;
  }
  if (!raw) {
    // Fallback: text/plain holding JSON, or legacy keys.
    raw = e.dataTransfer.getData("text/plain") || undefined;
    if (raw && !raw.startsWith("{")) raw = undefined;
  }
  if (raw) {
    try {
      const p = JSON.parse(raw) as LinkPayload;
      if (p && p.type && p.id) return p;
    } catch {
      /* ignore */
    }
  }
  // Legacy keys fallback (e.g. a Files drag that only set text/file-id).
  for (const type of LINKABLE_TYPES) {
    const id = e.dataTransfer.getData(legacyKey(type));
    if (id) return { type, id, title: id };
  }
  return null;
}

/** True if the drag event carries a link payload of any supported type. */
export function hasLinkPayload(e: React.DragEvent): boolean {
  if (e.dataTransfer.types.includes(LINK_MIME)) return true;
  for (const type of LINKABLE_TYPES) {
    if (e.dataTransfer.types.includes(legacyKey(type))) return true;
  }
  return false;
}

/**
 * Prevent default + mark the drop as a "link" effect. Call from onDragOver
 * on any element that wants to accept link drops.
 */
export function allowLinkDrop(e: React.DragEvent): void {
  if (hasLinkPayload(e)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "link";
  }
}

// ===== Highlight utilities =====
// Shared helpers for the Study Hub highlighting feature: content hashing
// (for contentKey scoping), context extraction, and text-range re-anchoring.

import type { HighlightColor } from "../../services/study-highlights";

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
];

/** Tailwind-ish hex pairs for each highlight color (bg + border). Used by the
 *  selection toolbar swatches and the <mark> color classes in index.css. */
export const COLOR_LABEL: Record<HighlightColor, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
  purple: "Purple",
};

/** Fast non-crypto string hash (djb2) → base36. Good enough for contentKey
 *  scoping (we only need to detect "same content as before"). */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  // Force positive and base36-encode.
  return (h >>> 0).toString(36);
}

/** Content key for a markdown blob — hash of trimmed content. */
export function contentKeyFor(content: string): string {
  return hashString(content.trim());
}

/** Extract up to `radius` chars of context before/after a range in `text`. */
export function extractContext(
  text: string,
  start: number,
  end: number,
  radius = 80
): { contextBefore: string; contextAfter: string } {
  const before = text.slice(Math.max(0, start - radius), start);
  const after = text.slice(end, Math.min(text.length, end + radius));
  // Collapse whitespace to make the context robust to reflow.
  return {
    contextBefore: before.replace(/\s+/g, " ").trim(),
    contextAfter: after.replace(/\s+/g, " ").trim(),
  };
}

/** Find the offset of `needle` inside `haystack`, disambiguated by surrounding
 *  context. Returns the {start, end} offsets or null if not found.
 *
 *  Strategy:
 *   1. Collect all case-insensitive occurrences of needle.
 *   2. If only one, return it.
 *   3. Otherwise, score each by how well its surrounding context matches
 *      contextBefore / contextAfter (whitespace-normalized, substring match).
 *   4. Return the best-scoring occurrence; fall back to the first. */
export function findRangeInText(
  haystack: string,
  needle: string,
  contextBefore = "",
  contextAfter = ""
): { start: number; end: number } | null {
  if (!needle) return null;
  const hay = haystack.toLowerCase();
  const ndl = needle.toLowerCase();
  const occurrences: number[] = [];
  let from = 0;
  while (true) {
    const idx = hay.indexOf(ndl, from);
    if (idx === -1) break;
    occurrences.push(idx);
    from = idx + 1;
  }
  if (occurrences.length === 0) return null;
  if (occurrences.length === 1) {
    return { start: occurrences[0], end: occurrences[0] + needle.length };
  }

  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const cb = norm(contextBefore);
  const ca = norm(contextAfter);
  let best = occurrences[0];
  let bestScore = -1;
  for (const start of occurrences) {
    let score = 0;
    if (cb) {
      const before = haystack.slice(Math.max(0, start - 120), start);
      if (norm(before).includes(cb)) score += 2;
    }
    if (ca) {
      const after = haystack.slice(start + needle.length, start + needle.length + 120);
      if (norm(after).includes(ca)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return { start: best, end: best + needle.length };
}

// ===== Highlights store =====
// Per-contentKey cache of StudyHighlight entities plus create/update/remove
// actions. Reading surfaces (HighlightableMarkdown, useCodemirrorHighlights)
// call loadFor(contentKey) on mount and read getFor(contentKey) to render
// marks. The central Highlights mode calls loadAll() to populate the list.

import { create } from "zustand";
import {
  studyHighlightsApi,
  type StudyHighlight,
  type HighlightColor,
  type HighlightScope,
  type CreateHighlightInput,
} from "../services/study-highlights";

interface HighlightsState {
  /** All highlights for the user (loaded by the central Highlights mode). */
  all: StudyHighlight[];
  /** Per-contentKey cache (loaded by reading surfaces). */
  byKey: Record<string, StudyHighlight[]>;
  /** Track in-flight loads to avoid duplicate requests. */
  loadingKeys: Set<string>;
  loadedAll: boolean;

  loadAll: () => Promise<void>;
  loadFor: (contentKey: string) => Promise<void>;
  getFor: (contentKey: string) => StudyHighlight[];

  create: (input: CreateHighlightInput) => Promise<StudyHighlight | null>;
  update: (
    id: string,
    patch: { color?: HighlightColor; annotation?: string | null }
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;

  /** Filter the all-list by scope/color for the Highlights panel. */
  filter: (opts: { scope?: HighlightScope; color?: HighlightColor }) => StudyHighlight[];
}

export const useHighlights = create<HighlightsState>((set, get) => ({
  all: [],
  byKey: {},
  loadingKeys: new Set(),
  loadedAll: false,

  loadAll: async () => {
    try {
      const { highlights } = await studyHighlightsApi.list();
      const byKey: Record<string, StudyHighlight[]> = {};
      for (const h of highlights) {
        (byKey[h.contentKey] ??= []).push(h);
      }
      set({ all: highlights, byKey, loadedAll: true });
    } catch {
      /* non-fatal */
    }
  },

  loadFor: async (contentKey: string) => {
    if (!contentKey) return;
    const { loadingKeys, byKey } = get();
    if (loadingKeys.has(contentKey) || byKey[contentKey]) return;
    set({ loadingKeys: new Set(loadingKeys).add(contentKey) });
    try {
      const { highlights } = await studyHighlightsApi.list({ contentKey });
      set((s) => ({
        byKey: { ...s.byKey, [contentKey]: highlights },
        loadingKeys: (() => {
          const n = new Set(s.loadingKeys);
          n.delete(contentKey);
          return n;
        })(),
      }));
    } catch {
      set((s) => {
        const n = new Set(s.loadingKeys);
        n.delete(contentKey);
        return { loadingKeys: n };
      });
    }
  },

  getFor: (contentKey: string) => get().byKey[contentKey] ?? [],

  create: async (input) => {
    try {
      const { highlight } = await studyHighlightsApi.create(input);
      set((s) => {
        const list = s.byKey[input.contentKey] ?? [];
        return {
          byKey: { ...s.byKey, [input.contentKey]: [...list, highlight] },
          all: [highlight, ...s.all],
        };
      });
      return highlight;
    } catch {
      return null;
    }
  },

  update: async (id, patch) => {
    // Optimistic local update.
    set((s) => ({
      all: s.all.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      byKey: Object.fromEntries(
        Object.entries(s.byKey).map(([k, list]) => [
          k,
          list.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        ])
      ),
    }));
    try {
      await studyHighlightsApi.update(id, patch);
    } catch {
      /* non-fatal — optimistic state stays */
    }
  },

  remove: async (id) => {
    set((s) => ({
      all: s.all.filter((h) => h.id !== id),
      byKey: Object.fromEntries(
        Object.entries(s.byKey).map(([k, list]) => [k, list.filter((h) => h.id !== id)])
      ),
    }));
    try {
      await studyHighlightsApi.remove(id);
    } catch {
      /* non-fatal */
    }
  },

  filter: ({ scope, color }) =>
    get().all.filter(
      (h) => (!scope || h.scope === scope) && (!color || h.color === color)
    ),
}));

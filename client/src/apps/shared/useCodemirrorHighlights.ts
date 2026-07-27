// ===== useCodemirrorHighlights =====
// Persistent, user-driven highlighting for CodeMirror-based apps (Notes,
// Editor). Complements useCodemirrorShowControl (which is the Teacher's
// transient highlight). This hook:
//   - Loads all StudyHighlights for (scope, scopeId) and renders them as
//     persistent mark decorations (cm-study-hl-<color>).
//   - Re-anchors highlights via text search on every doc change (so they
//     survive edits — highlights detach only if the highlighted text is gone).
//   - Tracks the active selection and exposes it so the app can render a
//     <CodemirrorHighlightToolbar> to create/edit/delete highlights.
//
// Unlike the markdown surfaces (which key off contentKey), Notes/Editor content
// evolves as the user edits, so highlights are scoped to (scope, scopeId) and
// re-anchored by text search each update.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import {
  studyHighlightsApi,
  type StudyHighlight,
  type HighlightColor,
  type HighlightScope,
  type CreateHighlightInput,
} from "../../services/study-highlights";
import {
  contentKeyFor, extractContext, findRangeInText,
} from "../study/highlightUtils";

const setHighlightsEffect = StateEffect.define<StudyHighlight[]>();

interface HighlightState {
  highlights: StudyHighlight[];
  decos: DecorationSet;
}

function buildDecos(highlights: StudyHighlight[], docText: string): DecorationSet {
  const decos: ReturnType<ReturnType<typeof Decoration.mark>["range"]>[] = [];
  for (const h of highlights) {
    const range = findRangeInText(docText, h.text, h.contextBefore, h.contextAfter);
    if (range) {
      decos.push(
        Decoration.mark({
          class: `cm-study-hl cm-study-hl-${h.color}`,
          attributes: { "data-highlight-id": h.id, title: h.annotation ?? "" },
        }).range(range.start, range.end)
      );
    }
  }
  decos.sort((a, b) => a.from - b.from);
  return Decoration.set(decos, true);
}

const highlightField = StateField.define<HighlightState>({
  create() {
    return { highlights: [], decos: Decoration.none };
  },
  update(value, tr) {
    let highlights = value.highlights;
    let needsRebuild = false;
    for (const e of tr.effects) {
      if (e.is(setHighlightsEffect)) {
        highlights = e.value;
        needsRebuild = true;
      }
    }
    if (tr.docChanged && highlights.length > 0) needsRebuild = true;
    let decos = value.decos;
    if (needsRebuild) {
      decos = buildDecos(highlights, tr.state.doc.toString());
    }
    return { highlights, decos };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
});

export interface CodemirrorSelection {
  text: string;
  /** Viewport-relative rect for positioning the toolbar. */
  rect: DOMRect;
  contextBefore: string;
  contextAfter: string;
  /** If the selection exactly matches an existing highlight's text, this is it
   *  (toolbar shows edit/delete instead of create). */
  existing?: StudyHighlight;
}

export interface UseCodemirrorHighlights {
  extensions: Extension[];
  onCreateEditor: (view: EditorView) => void;
  selection: CodemirrorSelection | null;
  clearSelection: () => void;
  highlights: StudyHighlight[];
  createHighlight: (input: Omit<CreateHighlightInput, "scope" | "scopeId" | "contentKey">) => Promise<StudyHighlight | null>;
  updateHighlight: (id: string, patch: { color?: HighlightColor; annotation?: string | null }) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;
}

export function useCodemirrorHighlights(opts: {
  winId: string | undefined;
  scope: HighlightScope;
  scopeId: string | undefined;
  sourceName?: string;
}): UseCodemirrorHighlights {
  const { scope, scopeId, sourceName } = opts;
  const viewRef = useRef<EditorView | null>(null);
  const [highlights, setHighlights] = useState<StudyHighlight[]>([]);
  const [selection, setSelection] = useState<CodemirrorSelection | null>(null);
  const highlightsRef = useRef<StudyHighlight[]>([]);
  highlightsRef.current = highlights;

  const onCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);

  // Push the current highlights into the editor's StateField whenever they
  // change (so decorations rebuild against the live doc).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setHighlightsEffect.of(highlights) });
  }, [highlights]);

  // Load highlights for this (scope, scopeId) on mount.
  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { highlights: loaded } = await studyHighlightsApi.list({ scope, scopeId });
        if (!cancelled) setHighlights(loaded);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [scope, scopeId]);

  // The updateListener needs to be in the extensions from the start. Rebuild
  // the extensions memo to include a stable updateListener.
  const extensionsWithListener = useMemo(() => {
    const listener = EditorView.updateListener.of((u) => {
      if (!u.selectionSet && !u.docChanged) return;
      const sel = u.state.selection.main;
      if (sel.empty) {
        setSelection(null);
        return;
      }
      const text = u.state.doc.sliceString(sel.from, sel.to);
      if (text.trim().length < 2) {
        setSelection(null);
        return;
      }
      const docText = u.state.doc.toString();
      const ctx = extractContext(docText, sel.from, sel.to);
      const existing = highlightsRef.current.find(
        (h) => h.text.trim().toLowerCase() === text.trim().toLowerCase()
      );
      let rect: DOMRect;
      try {
        const startCoords = u.view.coordsAtPos(sel.from);
        const endCoords = u.view.coordsAtPos(sel.to);
        if (startCoords && endCoords) {
          const left = Math.min(startCoords.left, endCoords.left);
          const right = Math.max(startCoords.right, endCoords.right);
          const top = Math.min(startCoords.top, endCoords.top);
          const bottom = Math.max(startCoords.bottom, endCoords.bottom);
          rect = new DOMRect(left, top, right - left, bottom - top);
        } else {
          rect = new DOMRect(window.innerWidth / 2 - 90, 80, 180, 40);
        }
      } catch {
        rect = new DOMRect(window.innerWidth / 2 - 90, 80, 180, 40);
      }
      setSelection({
        text,
        rect,
        contextBefore: ctx.contextBefore,
        contextAfter: ctx.contextAfter,
        existing,
      });
    });
    return [highlightField, listener];
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    const view = viewRef.current;
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty) view.dispatch({ selection: { anchor: sel.head } });
    }
  }, []);

  const createHighlight = useCallback(
    async (input: Omit<CreateHighlightInput, "scope" | "scopeId" | "contentKey">) => {
      if (!scopeId) return null;
      const view = viewRef.current;
      const docText = view ? view.state.doc.toString() : "";
      const payload: CreateHighlightInput = {
        ...input,
        scope,
        scopeId,
        contentKey: contentKeyFor(docText),
        sourceName,
      };
      try {
        const { highlight } = await studyHighlightsApi.create(payload);
        setHighlights((prev) => [...prev, highlight]);
        return highlight;
      } catch {
        return null;
      }
    },
    [scope, scopeId, sourceName]
  );

  const updateHighlight = useCallback(
    async (id: string, patch: { color?: HighlightColor; annotation?: string | null }) => {
      setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
      try {
        await studyHighlightsApi.update(id, patch);
      } catch { /* non-fatal */ }
    },
    []
  );

  const removeHighlight = useCallback(async (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    try {
      await studyHighlightsApi.remove(id);
    } catch { /* non-fatal */ }
  }, []);

  return {
    extensions: extensionsWithListener,
    onCreateEditor,
    selection,
    clearSelection,
    highlights,
    createHighlight,
    updateHighlight,
    removeHighlight,
  };
}

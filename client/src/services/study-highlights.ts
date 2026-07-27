// ===== Study Hub: highlights API client =====
// Persistent user highlights & annotations on Study Hub reading surfaces.
// Mounted at /api/study/highlights.

import { api } from "./api";

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";

export type HighlightScope =
  | "chat"
  | "teacher"
  | "summarize"
  | "explain"
  | "study_guide"
  | "podcast"
  | "note"
  | "editor";

export interface StudyHighlight {
  id: string;
  scope: HighlightScope;
  scopeId: string;
  contentKey: string;
  text: string;
  contextBefore: string;
  contextAfter: string;
  color: HighlightColor;
  annotation: string | null;
  sourceName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHighlightInput {
  scope: HighlightScope;
  scopeId: string;
  contentKey: string;
  text: string;
  contextBefore?: string;
  contextAfter?: string;
  color?: HighlightColor;
  annotation?: string;
  sourceName?: string;
}

export const studyHighlightsApi = {
  list: (filters?: { scope?: string; scopeId?: string; contentKey?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.scope) qs.set("scope", filters.scope);
    if (filters?.scopeId) qs.set("scopeId", filters.scopeId);
    if (filters?.contentKey) qs.set("contentKey", filters.contentKey);
    const q = qs.toString();
    return api.get<{ highlights: StudyHighlight[] }>(
      `/api/study/highlights${q ? `?${q}` : ""}`
    );
  },

  create: (input: CreateHighlightInput) =>
    api.post<{ highlight: StudyHighlight }>("/api/study/highlights", input),

  update: (id: string, patch: { color?: HighlightColor; annotation?: string | null }) =>
    api.patch<{ highlight: StudyHighlight }>(`/api/study/highlights/${id}`, patch),

  remove: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/study/highlights/${id}`),

  exportAsNote: (ids: string[], title?: string) =>
    api.post<{ noteId: string }>("/api/study/highlights/export", { ids, title }),
};

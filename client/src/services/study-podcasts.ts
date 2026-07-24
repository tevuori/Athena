// ===== Study Hub: podcast / audio overview API client =====

import { api } from "./api";

export interface Podcast {
  id: string;
  title: string;
  scriptNoteId: string | null;
  sourceIds: string[];
  host1Label: string;
  host2Label: string;
  durationEstimate: number;
  createdAt: string;
  /** Only present on the single-podcast GET. */
  script?: string;
}

export const studyPodcastsApi = {
  generate: (data: {
    sourceIds: string[];
    title?: string;
    host1Label?: string;
    host2Label?: string;
  }) => api.post<{ podcast: Podcast; noteId: string }>("/api/study/podcasts/generate", data),

  list: () => api.get<{ podcasts: Podcast[] }>("/api/study/podcasts"),

  get: (id: string) => api.get<{ podcast: Podcast }>(`/api/study/podcasts/${id}`),

  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/study/podcasts/${id}`),
};

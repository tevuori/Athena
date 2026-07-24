// ===== Study Hub: learning workspaces API client =====
// Named, persistent groups of StudySources — a saved source set reusable
// across grounded Q&A and podcasts.

import { api } from "./api";
import type { SourceDescriptor } from "./study";

export interface LearningWorkspace {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const studyWorkspacesApi = {
  list: () => api.get<{ workspaces: LearningWorkspace[] }>("/api/study/workspaces"),

  get: (id: string) => api.get<{ workspace: LearningWorkspace }>(`/api/study/workspaces/${id}`),

  create: (data: {
    name: string;
    description?: string;
    color?: string;
    sourceIds?: string[];
    sources?: SourceDescriptor[];
  }) => api.post<{ workspace: LearningWorkspace }>("/api/study/workspaces", data),

  patch: (id: string, data: {
    name?: string;
    description?: string | null;
    color?: string | null;
    sourceIds?: string[];
  }) => api.patch<{ workspace: LearningWorkspace }>(`/api/study/workspaces/${id}`, data),

  addSources: (id: string, data: { sourceIds?: string[]; sources?: SourceDescriptor[] }) =>
    api.post<{ workspace: LearningWorkspace; added: number }>(`/api/study/workspaces/${id}/sources`, data),

  removeSource: (id: string, sourceId: string) =>
    api.delete<{ workspace: LearningWorkspace }>(`/api/study/workspaces/${id}/sources/${sourceId}`),

  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/study/workspaces/${id}`),
};

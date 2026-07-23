// ===== Ntfy API client =====
// Config, test, message log, manual send, and cron-job CRUD.

import { api } from "./api";

export interface NtfyStatus {
  configured: boolean;
  enabled: boolean;
  serverUrl: string;
  notifyTopic: string;
  inboxTopic: string;
  defaultPriority: number;
}

export interface NtfyConfigInput {
  serverUrl?: string;
  token?: string;
  notifyTopic?: string;
  inboxTopic?: string;
  enabled?: boolean;
  defaultPriority?: number;
}

export interface NtfyMessage {
  id: string;
  direction: string; // "in" | "out" | "cron"
  topic: string;
  title: string;
  body: string;
  priority: number;
  tags: string;
  cronJobId: string | null;
  createdAt: string;
}

export interface NtfyCronJob {
  id: string;
  userId: string;
  name: string;
  cron: string;
  type: string; // "notification" | "athena"
  message: string;
  prompt: string;
  title: string;
  priority: number;
  tags: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NtfyCronInput {
  name: string;
  cron: string;
  type: "notification" | "athena";
  message?: string;
  prompt?: string;
  title?: string;
  priority?: number;
  tags?: string;
  enabled?: boolean;
}

export const ntfyApi = {
  getStatus: () => api.get<NtfyStatus>("/api/ntfy/status"),

  saveConfig: (input: NtfyConfigInput) =>
    api.put<NtfyStatus>("/api/ntfy/config", input),

  deleteConfig: () => api.delete<{ ok: boolean }>("/api/ntfy/config"),

  test: () => api.post<{ ok: boolean }>("/api/ntfy/test", {}),

  send: (body: { title?: string; body: string; priority?: number; tags?: string }) =>
    api.post<{ ok: boolean }>("/api/ntfy/send", body),

  getMessages: (limit = 100) =>
    api.get<{ messages: NtfyMessage[] }>(`/api/ntfy/messages?limit=${limit}`),

  listCronJobs: () => api.get<{ jobs: NtfyCronJob[] }>("/api/ntfy/cron"),

  getCronJob: (id: string) => api.get<{ job: NtfyCronJob }>(`/api/ntfy/cron/${id}`),

  createCronJob: (input: NtfyCronInput) =>
    api.post<{ job: NtfyCronJob }>("/api/ntfy/cron", input),

  updateCronJob: (id: string, input: Partial<NtfyCronInput>) =>
    api.put<{ job: NtfyCronJob }>(`/api/ntfy/cron/${id}`, input),

  deleteCronJob: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/ntfy/cron/${id}`),

  runCronJob: (id: string) =>
    api.post<{ ok: boolean }>(`/api/ntfy/cron/${id}/run`, {}),

  previewCron: (cron: string, count = 3) =>
    api.post<{ runs: string[] } | { error: string }>("/api/ntfy/cron/preview", { cron, count }),
};

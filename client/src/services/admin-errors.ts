import { api } from "./api";

export interface ErrorLogItem {
  id: string;
  timestamp: string;
  level: string;
  source: "client" | "server";
  message: string;
  stack?: string | null;
  url?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  resolved: boolean;
  createdAt: string;
  user?: { username: string; displayName: string } | null;
}

export interface ErrorLogList {
  items: ErrorLogItem[];
  total: number;
}

export interface ErrorLogStats {
  total: number;
  unresolved: number;
  client: number;
  server: number;
  last24h: number;
}

export const adminErrorsApi = {
  list: (params?: { source?: "client" | "server"; resolved?: boolean; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.source) qs.set("source", params.source);
    if (params?.resolved !== undefined) qs.set("resolved", String(params.resolved));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return api.get<ErrorLogList>(`/api/admin/errors${q ? `?${q}` : ""}`);
  },
  stats: () => api.get<ErrorLogStats>("/api/admin/errors/stats"),
  resolve: (id: string) => api.put<{ ok: boolean }>(`/api/admin/errors/${id}/resolve`, {}),
  resolveAll: () => api.put<{ ok: boolean; count: number }>("/api/admin/errors/resolve-all", {}),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/admin/errors/${id}`),
  deleteResolved: () => api.delete<{ ok: boolean; count: number }>("/api/admin/errors/resolved"),
};

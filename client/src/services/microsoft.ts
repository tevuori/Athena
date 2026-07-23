import { api } from "./api";

export const microsoftApi = {
  status: () => api.get<{ configured: boolean }>("/api/microsoft/status"),
  sync: (from?: string, to?: string) =>
    api.post<{ synced: number; deleted: number; range: { from: string; to: string } }>(
      "/api/microsoft/sync",
      { from, to }
    ),
  push: (eventId: string) =>
    api.post<{ event: unknown; created?: boolean; updated?: boolean }>(
      "/api/microsoft/push",
      { eventId }
    ),
  deleteRemote: (msId: string) =>
    api.delete(`/api/microsoft/event/${msId}`),
};

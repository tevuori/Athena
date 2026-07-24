import { api } from "./api";

export interface MicrosoftCredentialStatus {
  hasCredentials: boolean;
  configured: boolean;
  usingEnvFallback: boolean;
}

export const microsoftApi = {
  // ---------- Credential management (per-user) ----------
  getCredentials: () => api.get<MicrosoftCredentialStatus>("/api/microsoft/credentials"),
  setCredentials: (
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    tenantId?: string
  ) =>
    api.put<{ ok: boolean }>("/api/microsoft/credentials", {
      clientId,
      clientSecret,
      refreshToken,
      tenantId: tenantId ?? "",
    }),
  deleteCredentials: () => api.delete<{ ok: boolean }>("/api/microsoft/credentials"),

  // ---------- Calendar sync ----------
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

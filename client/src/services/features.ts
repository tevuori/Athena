import { api } from "./api";

export interface AdminAppEntry {
  id: string;
  tier: "core" | "beta";
  requiresGrant?: "vut";
  undisableable: boolean;
}

export interface AdminFeaturesState {
  apps: AdminAppEntry[];
  disabledApps: string[];
}

export const featuresAdminApi = {
  getState: () => api.get<AdminFeaturesState>("/api/features/admin"),
  setDisabled: (apps: string[]) =>
    api.put<{ disabledApps: string[] }>("/api/features/admin/disabled", { apps }),
  getGrants: (userId: string) =>
    api.get<{ vut: boolean }>(`/api/features/admin/users/${userId}/grants`),
  setGrants: (userId: string, vut: boolean) =>
    api.put<{ vut: boolean }>(`/api/features/admin/users/${userId}/grants`, { vut }),
};

import { api } from "./api";

export interface AuthDevice {
  id: string;
  deviceLabel: string;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
}

export const authApi = {
  listDevices: () => api.get<AuthDevice[]>("/api/auth/devices"),
  revokeDevice: (id: string) => api.delete(`/api/auth/devices/${id}`),
  revokeAllDevices: () => api.delete("/api/auth/devices"),
};

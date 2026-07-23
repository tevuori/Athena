import { api } from "./api";
import type { AdminUser, UserRole } from "../types";

export const usersApi = {
  list: () => api.get<AdminUser[]>("/api/users"),
  create: (data: {
    username: string;
    password: string;
    displayName?: string;
    avatarColor?: string;
    role?: UserRole;
  }) => api.post<AdminUser>("/api/users", data),
  update: (
    id: string,
    data: { displayName?: string; avatarColor?: string; role?: UserRole }
  ) => api.patch<AdminUser>(`/api/users/${id}`, data),
  resetPassword: (id: string, password: string) =>
    api.post(`/api/users/${id}/reset-password`, { password }),
  remove: (id: string) => api.delete(`/api/users/${id}`),
};

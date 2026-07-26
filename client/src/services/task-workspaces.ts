import { api } from "./api";
import type { TaskWorkspace } from "../types";

export const taskWorkspacesApi = {
  list: () =>
    api.get<{ workspaces: (TaskWorkspace & { taskCount: number })[] }>(
      "/api/task-workspaces"
    ),
  create: (data: { name: string; color?: string }) =>
    api.post<{ workspace: TaskWorkspace }>("/api/task-workspaces", data),
  update: (
    id: string,
    data: Partial<{ name: string; color: string }>
  ) => api.patch<{ workspace: TaskWorkspace }>(`/api/task-workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/api/task-workspaces/${id}`),
};

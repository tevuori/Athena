import { api } from "./api";
import type { Whiteboard, WhiteboardSummary } from "../types";

export const whiteboardsApi = {
  list: () => api.get<{ whiteboards: WhiteboardSummary[] }>("/api/whiteboards"),
  get: (id: string) => api.get<{ whiteboard: Whiteboard }>(`/api/whiteboards/${id}`),
  create: (data: { name?: string; content?: string }) =>
    api.post<{ whiteboard: Whiteboard }>("/api/whiteboards", data),
  update: (id: string, data: { name?: string; content?: string }) =>
    api.put<{ whiteboard: Whiteboard }>(`/api/whiteboards/${id}`, data),
  delete: (id: string) => api.delete(`/api/whiteboards/${id}`),
};

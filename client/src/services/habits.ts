import { api } from "./api";
import type { Habit, HabitStats } from "../types";

export const habitsApi = {
  list: () => api.get<{ habits: Habit[] }>("/api/habits"),
  create: (data: Partial<Habit>) =>
    api.post<{ habit: Habit }>("/api/habits", data),
  update: (id: string, data: Partial<Habit>) =>
    api.patch<{ habit: Habit }>(`/api/habits/${id}`, data),
  delete: (id: string) => api.delete(`/api/habits/${id}`),
  logs: (id: string, from?: string, to?: string) =>
    api.get<{ logs: { id: string; habitId: string; date: string; value: number }[] }>(
      `/api/habits/${id}/logs${from || to ? `?${from ? `from=${encodeURIComponent(from)}` : ""}${from && to ? "&" : ""}${to ? `to=${encodeURIComponent(to)}` : ""}` : ""}`
    ),
  log: (id: string, date?: string, value?: number) =>
    api.post<{ log: { id: string; habitId: string; date: string; value: number } }>(
      `/api/habits/${id}/log`,
      { date, value }
    ),
  unlog: (id: string, date?: string) =>
    api.delete(`/api/habits/${id}/log${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  stats: () => api.get<{ stats: HabitStats[] }>("/api/habits/stats"),
};

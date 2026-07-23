import { api } from "./api";
import type { CalendarEvent } from "../types";

export const calendarApi = {
  feed: (from?: string, to?: string) =>
    api.get<{ events: CalendarEvent[] }>(
      `/api/calendar/feed${from || to ? `?${from ? `from=${encodeURIComponent(from)}` : ""}${from && to ? "&" : ""}${to ? `to=${encodeURIComponent(to)}` : ""}` : ""}`
    ),
  list: () => api.get<{ events: CalendarEvent[] }>("/api/calendar"),
  create: (data: Partial<CalendarEvent>) =>
    api.post<{ event: CalendarEvent }>("/api/calendar", data),
  update: (id: string, data: Partial<CalendarEvent>) =>
    api.patch<{ event: CalendarEvent }>(`/api/calendar/${id}`, data),
  delete: (id: string) => api.delete(`/api/calendar/${id}`),
  importIcs: (ics: string, from?: string, to?: string) =>
    api.post<{ imported: number }>("/api/calendar/ics/import", { ics, from, to }),
  exportUrl: () => "/api/calendar/ics/export",
};

import { api, getToken } from "./api";
import type { VutGrade, VutTimetableSlot, VutSubjectUpdate } from "../types";

export const vutApi = {
  login: (username: string, password: string) =>
    api.post<{ ok: boolean; username: string }>("/api/vut/login", { username, password }),
  status: () =>
    api.get<{ configured: boolean; username?: string; authenticated: boolean }>("/api/vut/status"),
  logout: () => api.post("/api/vut/logout", {}),
  deleteCredentials: () => api.delete("/api/vut/credentials"),

  grades: () => api.get<{ grades: VutGrade[]; semesters: string[] }>("/api/vut/grades"),
  timetable: () => api.get<{ slots: VutTimetableSlot[] }>("/api/vut/timetable"),
  updates: () => api.get<{ updates: VutSubjectUpdate[] }>("/api/vut/updates"),

  proxyUrl: (path: string) => {
    const token = getToken();
    return `/api/vut/proxy?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token ?? "")}`;
  },
};

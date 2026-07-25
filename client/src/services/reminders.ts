// ===== Reminders API client =====
// One-shot ntfy-delivered reminders. Two types: "basic" (fixed message) and
// "athena" (LLM-generated at fire time). Mirrors the server routes in
// routes/reminders.ts.

import { api } from "./api";

export interface Reminder {
  id: string;
  userId: string;
  type: string; // "basic" | "athena"
  title: string;
  message: string;
  prompt: string;
  fireAt: string;
  priority: number;
  tags: string;
  fired: boolean;
  firedAt: string | null;
  cancelled: boolean;
  createdAt: string;
}

export interface ReminderInput {
  type: "basic" | "athena";
  title?: string;
  message?: string;
  prompt?: string;
  fireAt: string; // ISO 8601
  priority?: number;
  tags?: string;
}

export type ReminderStatus = "pending" | "fired" | "cancelled" | "all";

export const remindersApi = {
  list: (status: ReminderStatus = "pending") =>
    api.get<{ reminders: Reminder[] }>(`/api/reminders?status=${status}`),

  create: (input: ReminderInput) =>
    api.post<{ reminder: Reminder }>("/api/reminders", input),

  cancel: (id: string) =>
    api.post<{ reminder: Reminder }>(`/api/reminders/${id}/cancel`, {}),

  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/reminders/${id}`),
};

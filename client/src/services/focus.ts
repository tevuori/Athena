// ===== Focus session logging (Pomodoro → Analytics) =====
// Best-effort: the Pomodoro app calls this when a focus phase completes so the
// Analytics dashboard can chart study hours over time. Errors are swallowed
// by the caller — the timer must keep working if the server is unreachable.

import { api } from "./api";

export const focusApi = {
  logSession: (data: { durationMinutes: number; phase?: string; date?: string }) =>
    api.post<{ session: { id: string; date: string; durationMinutes: number } }>(
      "/api/focus/sessions",
      data
    ),
};

// ===== Proactive alerts API client =====
// Config CRUD + "test" (fire a one-off briefing) for the proactive daily
// briefing scheduler.

import { api } from "./api";

export interface ProactiveAlertConfig {
  id: string;
  userId: string;
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
  categories: string; // comma-separated
  customPrompt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProactiveAlertConfigInput {
  enabled?: boolean;
  hour?: number;
  minute?: number;
  categories?: string;
  customPrompt?: string;
}

export const proactiveAlertsApi = {
  getConfig: () => api.get<{ config: ProactiveAlertConfig }>("/api/proactive-alerts"),

  saveConfig: (input: ProactiveAlertConfigInput) =>
    api.put<{ config: ProactiveAlertConfig }>("/api/proactive-alerts", input),

  test: () => api.post<{ ok: boolean; body?: string; error?: string }>("/api/proactive-alerts/test", {}),
};

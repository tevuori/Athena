import { api } from "./api";

export interface AiKeyStatus {
  hasKey: boolean;
  provider: string;
  baseUrl: string;
  modelId: string;
  configured: boolean;
  rateLimitEnabled: boolean;
  rateLimitRpd: number;
  rateLimitRpm: number;
  hasFallback: boolean;
  fallbackProvider: string;
  fallbackBaseUrl: string;
  fallbackModelId: string;
  rateLimitUsage: { dayCount: number; minuteCount: number };
}

export const aiApi = {
  getKeyStatus: () => api.get<AiKeyStatus>("/api/ai/key"),
  setKey: (apiKey: string, provider?: string, baseUrl?: string, modelId?: string) =>
    api.put<{ ok: boolean; provider: string }>("/api/ai/key", { apiKey, provider, baseUrl, modelId }),
  deleteKey: () => api.delete<{ ok: boolean }>("/api/ai/key"),
  setRateLimit: (data: {
    rateLimitEnabled?: boolean;
    rateLimitRpd?: number;
    rateLimitRpm?: number;
  }) => api.put<{ ok: boolean }>("/api/ai/rate-limit", data),
  setFallback: (data: {
    fallbackApiKey?: string;
    fallbackProvider?: string;
    fallbackBaseUrl?: string;
    fallbackModelId?: string;
  }) => api.put<{ ok: boolean }>("/api/ai/fallback", data),
};

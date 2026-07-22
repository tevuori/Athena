import { api } from "./api";

export interface AiKeyStatus {
  hasKey: boolean;
  provider: string;
  baseUrl: string;
  modelId: string;
  configured: boolean;
}

export const aiApi = {
  getKeyStatus: () => api.get<AiKeyStatus>("/api/ai/key"),
  setKey: (apiKey: string, provider?: string, baseUrl?: string, modelId?: string) =>
    api.put<{ ok: boolean; provider: string }>("/api/ai/key", { apiKey, provider, baseUrl, modelId }),
  deleteKey: () => api.delete<{ ok: boolean }>("/api/ai/key"),
};

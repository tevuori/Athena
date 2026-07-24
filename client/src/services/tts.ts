// ===== TTS client API (ElevenLabs via server, Web Speech API fallback) =====
// The server proxies ElevenLabs requests (keeping the API key server-side).
// If TTS isn't configured, the client falls back to the Web Speech API.

import { api, getToken, apiUrl } from "./api";

export interface TtsConfig {
  configured: boolean;
  hasUserKey: boolean;
  voiceId: string;
  modelId: string;
  provider: string;
}

export interface TtsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TtsTimedResult {
  audio_base64: string;
  contentType: string;
  alignment?: TtsAlignment;
}

export const ttsApi = {
  async getConfig(): Promise<TtsConfig> {
    return api.get("/api/tts/config");
  },
  async saveCredential(input: { apiKey: string; voiceId?: string; modelId?: string }): Promise<{ ok: boolean }> {
    return api.put("/api/tts/credential", input);
  },
  async deleteCredential(): Promise<{ ok: boolean }> {
    return api.delete("/api/tts/credential");
  },
  /** Synthesize text → audio Blob (audio/mpeg). Returns null on error. */
  async synthesize(text: string, opts?: { stability?: number; similarityBoost?: number; speed?: number }): Promise<Blob | null> {
    const token = getToken();
    const res = await fetch(apiUrl("/api/tts/synthesize"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, ...opts }),
    });
    if (!res.ok) return null;
    return res.blob();
  },
  /** Synthesize with character-level timestamps. Returns null on error. */
  async synthesizeTimed(text: string, opts?: { stability?: number; similarityBoost?: number; speed?: number }): Promise<TtsTimedResult | null> {
    const res = await api.post<TtsTimedResult>("/api/tts/synthesize/timed", { text, ...opts });
    return res ?? null;
  },
};

/** Play a base64-encoded audio string. Returns the HTMLAudioElement. */
export function playBase64Audio(base64: string, contentType = "audio/mpeg"): HTMLAudioElement {
  const blob = base64ToBlob(base64, contentType);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  void audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
  return audio;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: contentType });
}

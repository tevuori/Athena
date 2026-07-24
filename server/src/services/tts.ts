// ===== TTS service (ElevenLabs primary, env fallback) =====
// Mirrors the AiCredential + server-env-fallback pattern from services/athena/llm.ts.
// Per-user TtsCredential (encrypted) takes priority; the ELEVENLABS_API_KEY env
// var is the server-wide fallback. If neither is set, the client uses the Web
// Speech API (see useTeacherTts.ts).

import prisma from "../db/client";
import { decryptSecret } from "./crypto";

const SERVER_ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

export interface TtsUserConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** Resolve the user's TTS config: per-user (DB) wins, server fallback otherwise. */
export async function getTtsConfig(userId: string): Promise<TtsUserConfig> {
  const cred = await prisma.ttsCredential.findUnique({ where: { userId } });
  if (cred) {
    const apiKey = decryptSafe(cred.apiKeyEnc);
    if (apiKey && apiKey.trim()) {
      return {
        apiKey: apiKey.trim(),
        voiceId: cred.voiceId?.trim() || DEFAULT_VOICE_ID,
        modelId: cred.modelId?.trim() || DEFAULT_MODEL_ID,
      };
    }
  }
  return {
    apiKey: SERVER_ELEVENLABS_KEY,
    voiceId: DEFAULT_VOICE_ID,
    modelId: DEFAULT_MODEL_ID,
  };
}

export async function isTtsConfiguredFor(userId: string): Promise<boolean> {
  const cfg = await getTtsConfig(userId);
  return Boolean(cfg.apiKey);
}

function decryptSafe(enc: string): string | null {
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

export interface TtsResult {
  /** Audio MIME type (audio/mpeg for ElevenLabs). */
  contentType: string;
  /** Audio bytes. */
  audio: Buffer;
}

/** Synthesize text to speech via ElevenLabs. Returns audio/mpeg bytes. */
export async function synthesizeSpeech(
  cfg: TtsUserConfig,
  text: string,
  opts?: { stability?: number; similarityBoost?: number; speed?: number }
): Promise<TtsResult> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}`;
  const body = {
    text,
    model_id: cfg.modelId,
    voice_settings: {
      stability: opts?.stability ?? 0.5,
      similarity_boost: opts?.similarityBoost ?? 0.75,
      speed: opts?.speed ?? 1.0,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": cfg.apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const e = new Error(`ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 200)}`);
    (e as any).status = res.status;
    throw e;
  }
  const audio = Buffer.from(await res.arrayBuffer());
  return { contentType: "audio/mpeg", audio };
}

export interface TtsTimestampResult {
  audio: Buffer;
  contentType: string;
  /** Character-level alignment: { characters: [{char, start, end}], ... } */
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

/** Synthesize with character-level timestamps (for speech-synced highlighting).
 *  Uses the with_timestamps=true query param. */
export async function synthesizeSpeechWithTimestamps(
  cfg: TtsUserConfig,
  text: string,
  opts?: { stability?: number; similarityBoost?: number; speed?: number }
): Promise<TtsTimestampResult> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceId}?with_timestamps=true`;
  const body = {
    text,
    model_id: cfg.modelId,
    voice_settings: {
      stability: opts?.stability ?? 0.5,
      similarity_boost: opts?.similarityBoost ?? 0.75,
      speed: opts?.speed ?? 1.0,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": cfg.apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const e = new Error(`ElevenLabs TTS (timestamps) failed (${res.status}): ${errText.slice(0, 200)}`);
    (e as any).status = res.status;
    throw e;
  }
  const json = (await res.json()) as any;
  const audioBase64 = json?.audio_base64 ?? "";
  const audio = Buffer.from(audioBase64, "base64");
  const alignment = json?.alignment ?? undefined;
  return { audio, contentType: "audio/mpeg", alignment };
}

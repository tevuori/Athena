// ===== TTS service (Edge TTS primary, ElevenLabs optional premium) =====
// Microsoft Edge TTS is the default provider — free, no API key, 400+ neural
// voices including Czech (cs-CZ-AntoninNeural, cs-CZ-VlastaNeural), and word
// boundary events for speech-synced highlighting.
//
// If the user has set an ElevenLabs API key (per-user or server env), it's used
// as a premium option. Otherwise Edge TTS handles everything.
//
// If neither is available (offline), the client falls back to Web Speech API
// (see useTeacherTts.ts).

import { Communicate } from "edge-tts-universal";
import prisma from "../db/client";
import { decryptSecret } from "./crypto";

const SERVER_ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";

// ----- Edge TTS voice selection -----

/** Map a language code to a good default Edge TTS voice. */
const EDGE_VOICE_MAP: Record<string, string> = {
  cs: "cs-CZ-AntoninNeural",
  en: "en-US-EmmaMultilingualNeural",
  de: "de-DE-KatjaNeural",
  fr: "fr-FR-DeniseNeural",
  es: "es-ES-ElviraNeural",
  it: "it-IT-ElsaNeural",
  pt: "pt-PT-RaquelNeural",
  ru: "ru-RU-SvetlanaNeural",
  pl: "pl-PL-ZofiaNeural",
  nl: "nl-NL-ColetteNeural",
  sv: "sv-SE-SofieNeural",
  da: "da-DR-ChristinaNeural",
  fi: "fi-FI-NooraNeural",
  no: "nb-NO-PernilleNeural",
  ja: "ja-JP-NanamiNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ko: "ko-KR-SunHiNeural",
  hi: "hi-IN-SwaraNeural",
  ar: "ar-SA-ZariyahNeural",
  tr: "tr-TR-EmelNeural",
  uk: "uk-UA-PolinaNeural",
  hu: "hu-HU-NoemiNeural",
  sk: "sk-SK-ViktoriaNeural",
};

/** Pick an Edge TTS voice for the given language code. */
export function pickEdgeVoice(language: string, userVoice?: string): string {
  if (userVoice && userVoice.trim()) return userVoice.trim();
  const lang = language.toLowerCase().slice(0, 2);
  return EDGE_VOICE_MAP[lang] ?? EDGE_VOICE_MAP.en;
}

// ----- ElevenLabs config (optional premium) -----

export interface TtsUserConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** Resolve the user's ElevenLabs config: per-user (DB) wins, server fallback otherwise. */
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

/** Returns "elevenlabs" if a working ElevenLabs key exists, else "edge". */
export async function resolveTtsProvider(userId: string): Promise<"elevenlabs" | "edge"> {
  const cfg = await getTtsConfig(userId);
  return cfg.apiKey ? "elevenlabs" : "edge";
}

export async function isTtsConfiguredFor(_userId: string): Promise<boolean> {
  // Edge TTS is always available (no key needed).
  return true;
}

function decryptSafe(enc: string): string | null {
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

// ----- Edge TTS synthesis -----

export interface EdgeWordBoundary {
  /** Offset from start of audio in seconds. */
  offset: number;
  /** Duration of this word in seconds. */
  duration: number;
  /** The word text. */
  text: string;
}

export interface TtsResult {
  /** Audio MIME type. */
  contentType: string;
  /** Audio bytes. */
  audio: Buffer;
}

export interface TtsTimedResult {
  audio: Buffer;
  contentType: string;
  /** Word boundaries for speech-synced highlighting. */
  wordBoundaries?: EdgeWordBoundary[];
  /** ElevenLabs character alignment (when using ElevenLabs). */
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  /** Which provider was used. */
  provider: "edge" | "elevenlabs";
}

/** Synthesize text via Microsoft Edge TTS. Returns audio + word boundaries. */
export async function synthesizeEdgeTts(
  text: string,
  voice: string,
  opts?: { rate?: string; volume?: string; pitch?: string }
): Promise<TtsTimedResult> {
  const communicate = new Communicate(text, {
    voice,
    rate: opts?.rate,
    volume: opts?.volume,
    pitch: opts?.pitch,
  });

  const audioChunks: Buffer[] = [];
  const wordBoundaries: EdgeWordBoundary[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      audioChunks.push(chunk.data);
    } else if (chunk.type === "WordBoundary" && chunk.offset != null && chunk.duration != null) {
      wordBoundaries.push({
        offset: chunk.offset / 1e7, // ticks (100ns) → seconds
        duration: chunk.duration / 1e7,
        text: chunk.text ?? "",
      });
    }
  }

  if (audioChunks.length === 0) {
    throw new Error("Edge TTS produced no audio");
  }

  return {
    audio: Buffer.concat(audioChunks),
    contentType: "audio/mpeg",
    wordBoundaries,
    provider: "edge",
  };
}

// ----- ElevenLabs synthesis (optional premium) -----

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

/** Synthesize with character-level timestamps (for speech-synced highlighting).
 *  Uses the with_timestamps=true query param. */
export async function synthesizeSpeechWithTimestamps(
  cfg: TtsUserConfig,
  text: string,
  opts?: { stability?: number; similarityBoost?: number; speed?: number }
): Promise<TtsTimedResult> {
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
  return { audio, contentType: "audio/mpeg", alignment, provider: "elevenlabs" };
}

// ----- Unified synthesis: try ElevenLabs, fall back to Edge TTS -----

/** Synthesize with timing data. Tries ElevenLabs (if configured), falls back to Edge TTS. */
export async function synthesizeTimed(
  userId: string,
  text: string,
  opts?: {
    language?: string;
    voice?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
  }
): Promise<TtsTimedResult> {
  const cfg = await getTtsConfig(userId);

  // Try ElevenLabs first if a key is configured.
  if (cfg.apiKey) {
    try {
      return await synthesizeSpeechWithTimestamps(cfg, text, {
        stability: opts?.stability,
        similarityBoost: opts?.similarityBoost,
        speed: opts?.speed,
      });
    } catch {
      // Fall through to Edge TTS.
    }
  }

  // Edge TTS — always available, no key needed.
  const voice = pickEdgeVoice(opts?.language ?? "en", opts?.voice);
  const rate = opts?.speed ? `${opts.speed > 1 ? "+" : ""}${Math.round((opts.speed - 1) * 100)}%` : undefined;
  return synthesizeEdgeTts(text, voice, { rate });
}

/** Synthesize plain audio (no timing). Tries ElevenLabs, falls back to Edge TTS. */
export async function synthesize(
  userId: string,
  text: string,
  opts?: {
    language?: string;
    voice?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
  }
): Promise<TtsResult> {
  const cfg = await getTtsConfig(userId);

  if (cfg.apiKey) {
    try {
      return await synthesizeSpeech(cfg, text, {
        stability: opts?.stability,
        similarityBoost: opts?.similarityBoost,
        speed: opts?.speed,
      });
    } catch {
      // Fall through to Edge TTS.
    }
  }

  const voice = pickEdgeVoice(opts?.language ?? "en", opts?.voice);
  const rate = opts?.speed ? `${opts.speed > 1 ? "+" : ""}${Math.round((opts.speed - 1) * 100)}%` : undefined;
  const result = await synthesizeEdgeTts(text, voice, { rate });
  return { contentType: result.contentType, audio: result.audio };
}

// ===== Lecture pipeline: chunked Whisper transcription =====
// Extracts audio, chunks it, calls whisper-1 verbose_json for per-segment
// timestamps, and merges results with offset correction.
//
// Transcription uses a SEPARATE endpoint config from the chat LLM because
// many OpenAI-compatible providers (OpenCode Zen, OpenRouter, Ollama, etc.)
// do NOT serve /audio/transcriptions. The hierarchy:
//   1. OPENAI_TRANSCRIPTION_BASE_URL + OPENAI_TRANSCRIPTION_API_KEY (dedicated)
//   2. Falls back to the user's LLM config (which may not work)
//   3. On any error → returns empty segments (pipeline continues with slide-only notes)

import { readFile } from "node:fs/promises";
import type { LlmUserConfig } from "../../athena/llm";

export interface TranscriptSegment {
  /** Start time in seconds (absolute, offset-corrected). */
  start: number;
  /** End time in seconds (absolute, offset-corrected). */
  end: number;
  /** Transcribed text for this segment. */
  text: string;
}

const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";
// Dedicated transcription endpoint (recommended: set to https://api.openai.com/v1)
const TRANSCRIPTION_BASE_URL = process.env.OPENAI_TRANSCRIPTION_BASE_URL ?? "";
const TRANSCRIPTION_API_KEY = process.env.OPENAI_TRANSCRIPTION_API_KEY ?? "";

/**
 * Resolve the transcription endpoint config. Prefers dedicated env vars;
 * falls back to the user's LLM config (which might not have Whisper).
 */
export function getTranscriptionConfig(userCfg: { apiKey: string; baseURL?: string }): {
  apiKey: string;
  baseURL: string;
} {
  if (TRANSCRIPTION_API_KEY && TRANSCRIPTION_BASE_URL) {
    return { apiKey: TRANSCRIPTION_API_KEY, baseURL: TRANSCRIPTION_BASE_URL };
  }
  if (TRANSCRIPTION_API_KEY) {
    return { apiKey: TRANSCRIPTION_API_KEY, baseURL: "https://api.openai.com/v1" };
  }
  if (TRANSCRIPTION_BASE_URL) {
    return { apiKey: userCfg.apiKey, baseURL: TRANSCRIPTION_BASE_URL };
  }
  // Fall back to user's LLM config — may not support /audio/transcriptions.
  return { apiKey: userCfg.apiKey, baseURL: userCfg.baseURL ?? "https://api.openai.com/v1" };
}

/**
 * Transcribe a single audio chunk via OpenAI-compatible /audio/transcriptions.
 * Uses verbose_json format to get per-segment timestamps.
 * Returns null on failure (non-fatal).
 */
async function transcribeChunk(
  cfg: { apiKey: string; baseURL: string },
  audioPath: string,
  offsetSec: number
): Promise<TranscriptSegment[] | null> {
  const base = cfg.baseURL.replace(/\/+$/, "");
  const url = `${base}/audio/transcriptions`;

  const audioBuf = await readFile(audioPath);
  const filename = audioPath.split("/").pop() ?? "audio.ogg";

  const form = new FormData();
  form.append("file", new Blob([audioBuf], { type: "audio/ogg" }), filename);
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[lecture-transcribe] Whisper failed (${res.status}): ${text.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as {
      text?: string;
      segments?: { start: number; end: number; text: string }[];
    };

    const segments = data.segments ?? [];
    if (segments.length === 0 && data.text) {
      // Fallback: no segments returned — create one covering the whole chunk.
      return [{ start: offsetSec, end: offsetSec + 900, text: data.text.trim() }];
    }

    return segments.map((s) => ({
      start: s.start + offsetSec,
      end: s.end + offsetSec,
      text: s.text.trim(),
    }));
  } catch (err) {
    console.warn("[lecture-transcribe] Whisper request error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Transcribe a list of audio chunks (from chunkAudio) and merge the results
 * into a single ordered list of segments with absolute timestamps.
 * Returns empty array if transcription is unavailable (non-fatal).
 */
export async function transcribeChunks(
  cfg: { apiKey: string; baseURL: string },
  chunks: { path: string; offsetSec: number }[],
  onProgress?: (done: number, total: number) => void
): Promise<TranscriptSegment[]> {
  const allSegments: TranscriptSegment[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const segments = await transcribeChunk(cfg, chunk.path, chunk.offsetSec);
    if (segments === null) {
      // First chunk failed — assume provider doesn't support transcription.
      // Bail early and return whatever we have (likely empty).
      console.warn("[lecture-transcribe] Transcription unavailable — continuing without transcript.");
      onProgress?.(chunks.length, chunks.length);
      break;
    }
    allSegments.push(...segments);
    onProgress?.(i + 1, chunks.length);
  }

  // Sort by start time (should already be ordered, but just in case).
  allSegments.sort((a, b) => a.start - b.start);
  return allSegments;
}

/** Join all segments into a single transcript string. */
export function fullTranscriptText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(" ");
}

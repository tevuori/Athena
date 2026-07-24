// ===== useTeacherTts: voice playback for the Interactive Teacher =====
// Server-side TTS (Edge TTS free default, or ElevenLabs if configured) with
// word-boundary / character-alignment callbacks for speech-synced highlighting.
// Falls back to Web Speech API if the server is unreachable.
//
// The hook splits assistant messages into sentences (for incremental
// synthesis + playback) and exposes:
//   - speak(text): synthesize + play
//   - stop(): cancel playback
//   - playing / supported state
//   - onWordBoundary callback (for speech-synced highlighting)

import { useState, useEffect, useCallback, useRef } from "react";
import { ttsApi, playBase64Audio, type TtsAlignment, type TtsWordBoundary } from "../../services/tts";

interface UseTeacherTtsOpts {
  /** Called with the current word position (char offset in the spoken text)
   *  as speech progresses. Used for speech-synced highlighting. */
  onWordBoundary?: (charStart: number, charEnd: number) => void;
  /** Language for voice selection ("en" | "cs"). */
  language?: "en" | "cs";
}

interface UseTeacherTtsResult {
  supported: boolean;
  /** "server" (Edge/ElevenLabs via server) | "webspeech" | "none" */
  provider: "server" | "webspeech" | "none";
  playing: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  /** Refresh the provider config (call after saving a credential). */
  refreshConfig: () => Promise<void>;
}

/** Split text into speakable chunks (sentences, max ~250 chars). */
function splitIntoChunks(text: string): string[] {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " code block ") // strip code blocks
    .replace(/[#*_`~\[\]]/g, "") // strip markdown formatting
    .replace(/\[n\]/g, "") // strip citation markers
    .replace(/\n+/g, " ")
    .trim();
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]*/g) ?? [cleaned];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((buf + " " + trimmed).length > 250) {
      if (buf) chunks.push(buf.trim());
      buf = trimmed;
    } else {
      buf = buf ? buf + " " + trimmed : trimmed;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export function useTeacherTts(opts: UseTeacherTtsOpts = {}): UseTeacherTtsResult {
  const webSpeechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  // Default to "server" — Edge TTS is always available (no key needed).
  // If the server is unreachable, speakServer throws and falls back to Web Speech.
  const [provider, setProvider] = useState<"server" | "webspeech" | "none">("server");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const onWordBoundaryRef = useRef(opts.onWordBoundary);
  onWordBoundaryRef.current = opts.onWordBoundary;
  const languageRef = useRef(opts.language ?? "en");
  languageRef.current = opts.language ?? "en";

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await ttsApi.getConfig();
      if (cfg.configured || cfg.edgeAvailable) setProvider("server");
      else if (webSpeechSupported) setProvider("webspeech");
      else setProvider("none");
    } catch {
      // Keep "server" — speakServer will fall back to Web Speech on error.
    }
  }, [webSpeechSupported]);

  useEffect(() => { void refreshConfig(); }, [refreshConfig]);

  const stop = useCallback(() => {
    cancelRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (webSpeechSupported) window.speechSynthesis.cancel();
    setPlaying(false);
  }, [webSpeechSupported]);

  /** Schedule word boundary callbacks from Edge TTS word boundaries. */
  function scheduleWordBoundaries(
    boundaries: TtsWordBoundary[],
    charOffset: number,
    cb: (charStart: number, charEnd: number) => void
  ) {
    for (const wb of boundaries) {
      const startTime = wb.offset * 1000; // seconds → ms
      const charStart = charOffset;
      const charEnd = charOffset + wb.text.length;
      setTimeout(() => {
        if (!cancelRef.current) cb(charStart, charEnd);
      }, startTime);
    }
  }

  /** Schedule character alignment callbacks from ElevenLabs alignment. */
  function scheduleAlignment(
    alignment: TtsAlignment,
    charOffset: number,
    cb: (charStart: number, charEnd: number) => void
  ) {
    const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
    for (let i = 0; i < characters.length; i++) {
      const startTime = character_start_times_seconds[i] ?? 0;
      const endTime = character_end_times_seconds[i] ?? startTime;
      const globalStart = charOffset + i;
      const globalEnd = charOffset + i + 1;
      setTimeout(() => cb(globalStart, globalEnd), startTime * 1000);
      void endTime;
    }
  }

  const speakServer = useCallback(async (text: string) => {
    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) return;
    cancelRef.current = false;
    setPlaying(true);
    let charOffset = 0;
    let hadError = false;
    for (const chunk of chunks) {
      if (cancelRef.current) break;
      try {
        const result = await ttsApi.synthesizeTimed(chunk, { language: languageRef.current });
        if (!result || cancelRef.current) break;
        const audio = playBase64Audio(result.audio_base64, result.contentType);
        audioRef.current = audio;
        // Schedule highlighting callbacks based on provider.
        if (onWordBoundaryRef.current) {
          if (result.wordBoundaries) {
            scheduleWordBoundaries(result.wordBoundaries, charOffset, onWordBoundaryRef.current);
          } else if (result.alignment) {
            scheduleAlignment(result.alignment, charOffset, onWordBoundaryRef.current);
          }
        }
        // Wait for this chunk to finish playing before starting the next.
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
        charOffset += chunk.length + 1; // +1 for the space between chunks
      } catch {
        hadError = true;
        break;
      }
    }
    audioRef.current = null;
    setPlaying(false);
    if (hadError) throw new Error("Server TTS failed");
  }, []);

  const speakWebSpeech = useCallback(async (text: string) => {
    if (!webSpeechSupported) return;
    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) return;
    cancelRef.current = false;
    setPlaying(true);
    window.speechSynthesis.cancel();
    for (const chunk of chunks) {
      if (cancelRef.current) break;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.rate = 1.0;
        u.lang = languageRef.current === "cs" ? "cs-CZ" : "en-US";
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
    setPlaying(false);
  }, [webSpeechSupported]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stop();
    if (provider === "server") {
      try {
        await speakServer(text);
      } catch {
        // Fallback to Web Speech on server TTS error.
        if (webSpeechSupported) await speakWebSpeech(text);
      }
    } else if (provider === "webspeech") {
      await speakWebSpeech(text);
    }
  }, [provider, stop, speakServer, speakWebSpeech, webSpeechSupported]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (audioRef.current) audioRef.current.pause();
      if (webSpeechSupported) window.speechSynthesis.cancel();
    };
  }, [webSpeechSupported]);

  return {
    supported: provider !== "none",
    provider,
    playing,
    speak,
    stop,
    refreshConfig,
  };
}

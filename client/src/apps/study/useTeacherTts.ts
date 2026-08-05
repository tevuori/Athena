// ===== useTeacherTts: voice playback for the Interactive Teacher =====
// Server-side TTS (Edge TTS free default, or ElevenLabs if configured) with
// word-boundary / character-alignment callbacks for speech-synced highlighting.
// Falls back to Web Speech API if the server is unreachable.
//
// The hook splits assistant messages into sentences (for incremental
// synthesis + playback, see teacherSpeech.ts) and exposes:
//   - speak(text, id?): synthesize + play, optionally tagged with a message id
//   - pause() / resume(): suspend playback without losing position
//   - stop(): cancel playback and every scheduled boundary callback
//   - playing / paused / speakingId state (per-message controls)
//   - onWordBoundary callback (for speech-synced highlighting)

import { useState, useEffect, useCallback, useRef } from "react";
import { ttsApi, playBase64Audio, type TtsAlignment, type TtsWordBoundary } from "../../services/tts";
import { splitIntoSpeechChunks } from "./teacherSpeech";

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
  paused: boolean;
  /** Id passed to speak() for the utterance currently playing (per-message UI). */
  speakingId: string | null;
  /** Playback progress of the current utterance, 0..1 (chunk-level granularity). */
  progress: number;
  speak: (text: string, id?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Refresh the provider config (call after saving a credential). */
  refreshConfig: () => Promise<void>;
}

export function useTeacherTts(opts: UseTeacherTtsOpts = {}): UseTeacherTtsResult {
  const webSpeechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  // Default to "server" — Edge TTS is always available (no key needed).
  // If the server is unreachable, speakServer throws and falls back to Web Speech.
  const [provider, setProvider] = useState<"server" | "webspeech" | "none">("server");
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const pausedRef = useRef(false);
  /**
   * Boundary callbacks are scheduled with setTimeout relative to the start of
   * a chunk. They must all be cancellable, otherwise stopping (or speaking a
   * different message) keeps highlighting the previous one.
   */
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onWordBoundaryRef = useRef(opts.onWordBoundary);
  onWordBoundaryRef.current = opts.onWordBoundary;
  const languageRef = useRef(opts.language ?? "en");
  languageRef.current = opts.language ?? "en";

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

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
    pausedRef.current = false;
    clearTimers();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (webSpeechSupported) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setSpeakingId(null);
    setProgress(0);
  }, [webSpeechSupported, clearTimers]);

  const pause = useCallback(() => {
    if (!playing || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    // Scheduled highlight callbacks would drift out of sync while paused.
    clearTimers();
    audioRef.current?.pause();
    if (webSpeechSupported && window.speechSynthesis.speaking) window.speechSynthesis.pause();
  }, [playing, webSpeechSupported, clearTimers]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    if (audioRef.current) void audioRef.current.play().catch(() => {});
    if (webSpeechSupported && window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, [webSpeechSupported]);

  /** Schedule (cancellable) word boundary callbacks from Edge TTS boundaries. */
  const scheduleWordBoundaries = useCallback((
    boundaries: TtsWordBoundary[],
    charOffset: number,
    cb: (charStart: number, charEnd: number) => void
  ) => {
    for (const wb of boundaries) {
      const startTime = wb.offset * 1000; // seconds → ms
      const charStart = charOffset;
      const charEnd = charOffset + wb.text.length;
      timersRef.current.push(setTimeout(() => {
        if (!cancelRef.current && !pausedRef.current) cb(charStart, charEnd);
      }, startTime));
    }
  }, []);

  /** Schedule character alignment callbacks from ElevenLabs alignment. */
  const scheduleAlignment = useCallback((
    alignment: TtsAlignment,
    charOffset: number,
    cb: (charStart: number, charEnd: number) => void
  ) => {
    const { characters, character_start_times_seconds } = alignment;
    for (let i = 0; i < characters.length; i++) {
      const startTime = character_start_times_seconds[i] ?? 0;
      const globalStart = charOffset + i;
      const globalEnd = charOffset + i + 1;
      timersRef.current.push(setTimeout(() => {
        if (!cancelRef.current && !pausedRef.current) cb(globalStart, globalEnd);
      }, startTime * 1000));
    }
  }, []);

  const speakServer = useCallback(async (text: string) => {
    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) return;
    cancelRef.current = false;
    setPlaying(true);
    let charOffset = 0;
    let hadError = false;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (cancelRef.current) break;
      try {
        const result = await ttsApi.synthesizeTimed(chunk, { language: languageRef.current });
        if (!result || cancelRef.current) break;
        const audio = playBase64Audio(result.audio_base64, result.contentType);
        audioRef.current = audio;
        setProgress(chunks.length > 1 ? i / (chunks.length - 1) : 1);
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
        clearTimers();
        charOffset += chunk.length + 1; // +1 for the space between chunks
      } catch {
        hadError = true;
        break;
      }
    }
    audioRef.current = null;
    clearTimers();
    setPlaying(false);
    setPaused(false);
    setSpeakingId(null);
    setProgress(0);
    if (hadError) throw new Error("Server TTS failed");
  }, [scheduleWordBoundaries, scheduleAlignment, clearTimers]);

  const speakWebSpeech = useCallback(async (text: string) => {
    if (!webSpeechSupported) return;
    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) return;
    cancelRef.current = false;
    setPlaying(true);
    window.speechSynthesis.cancel();
    let charOffset = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (cancelRef.current) break;
      setProgress(chunks.length > 1 ? i / (chunks.length - 1) : 1);
      const offsetForChunk = charOffset;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.rate = 1.0;
        u.lang = languageRef.current === "cs" ? "cs-CZ" : "en-US";
        // Web Speech reports boundaries natively — use them for highlighting.
        u.onboundary = (ev) => {
          const cb = onWordBoundaryRef.current;
          if (!cb || cancelRef.current || pausedRef.current) return;
          const start = offsetForChunk + (ev.charIndex ?? 0);
          cb(start, start + (ev.charLength || 1));
        };
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
      charOffset += chunk.length + 1;
    }
    setPlaying(false);
    setPaused(false);
    setSpeakingId(null);
    setProgress(0);
  }, [webSpeechSupported]);

  const speak = useCallback(async (text: string, id?: string) => {
    if (!text.trim()) return;
    stop();
    setSpeakingId(id ?? null);
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
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
      if (audioRef.current) audioRef.current.pause();
      if (webSpeechSupported) window.speechSynthesis.cancel();
    };
  }, [webSpeechSupported]);

  return {
    supported: provider !== "none",
    provider,
    playing,
    paused,
    speakingId,
    progress,
    speak,
    pause,
    resume,
    stop,
    refreshConfig,
  };
}

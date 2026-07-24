// ===== useTeacherTts: voice playback for the Interactive Teacher =====
// ElevenLabs primary (server-proxied, with character-level timestamps for
// speech-synced highlighting) → Web Speech API fallback when no key is set.
//
// The hook splits assistant messages into sentences (for incremental
// synthesis + playback) and exposes:
//   - speak(text): synthesize + play
//   - stop(): cancel playback
//   - playing / supported state
//   - onTimestamp callback (for speech-synced highlighting via alignment)

import { useState, useEffect, useCallback, useRef } from "react";
import { ttsApi, playBase64Audio, type TtsAlignment } from "../../services/tts";

interface UseTeacherTtsOpts {
  /** Called with the current word position (char offset in the spoken text)
   *  as ElevenLabs alignment progresses. Used for speech-synced highlighting. */
  onWordBoundary?: (charStart: number, charEnd: number) => void;
}

interface UseTeacherTtsResult {
  supported: boolean;
  /** "elevenlabs" | "webspeech" | "none" */
  provider: "elevenlabs" | "webspeech" | "none";
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
  const [provider, setProvider] = useState<"elevenlabs" | "webspeech" | "none">("none");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const onTimestampRef = useRef(opts.onWordBoundary);
  onTimestampRef.current = opts.onWordBoundary;

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await ttsApi.getConfig();
      if (cfg.configured) setProvider("elevenlabs");
      else if (webSpeechSupported) setProvider("webspeech");
      else setProvider("none");
    } catch {
      setProvider(webSpeechSupported ? "webspeech" : "none");
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

  const speakElevenLabs = useCallback(async (text: string) => {
    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) return;
    cancelRef.current = false;
    setPlaying(true);
    let charOffset = 0;
    for (const chunk of chunks) {
      if (cancelRef.current) break;
      try {
        const result = await ttsApi.synthesizeTimed(chunk);
        if (!result || cancelRef.current) break;
        const audio = playBase64Audio(result.audio_base64, result.contentType);
        audioRef.current = audio;
        // Schedule timestamp callbacks for speech-synced highlighting.
        if (result.alignment && onTimestampRef.current) {
          scheduleAlignment(result.alignment, charOffset, onTimestampRef.current);
        }
        // Wait for this chunk to finish playing before starting the next.
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
        charOffset += chunk.length + 1; // +1 for the space between chunks
      } catch {
        break;
      }
    }
    audioRef.current = null;
    setPlaying(false);
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
    if (provider === "elevenlabs") {
      try {
        await speakElevenLabs(text);
      } catch {
        // Fallback to Web Speech on ElevenLabs error.
        if (webSpeechSupported) await speakWebSpeech(text);
      }
    } else if (provider === "webspeech") {
      await speakWebSpeech(text);
    }
  }, [provider, stop, speakElevenLabs, speakWebSpeech, webSpeechSupported]);

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

/** Schedule onWordBoundary callbacks based on ElevenLabs character alignment. */
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
    // Use endTime to clear if needed — but we just fire start for highlighting.
    void endTime;
  }
}

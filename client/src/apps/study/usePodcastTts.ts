// ===== usePodcastTts: browser speechSynthesis podcast player =====
// Parses a 2-host dialogue script into turns ("Host: text" lines) and plays
// them via the Web Speech API, alternating two voices with different pitch/rate
// per host. Supports play/pause, skip, speed, and host voice selection.
//
// NOTE: browser speechSynthesis cannot be captured to a downloadable audio
// file — playback is in-browser only. The script note is the persistent
// artifact. This hook is isolated so a future server-side TTS provider can
// replace the playback without touching the player UI.

import { useState, useEffect, useCallback, useRef } from "react";

export interface PodcastTurn {
  host: string; // the label (e.g. "Host A")
  text: string;
}

/** Parse a script into turns. Lines not starting with "Label:" are appended to
 *  the previous turn (or skipped if there is none). */
export function parseScript(script: string, host1: string, host2: string): PodcastTurn[] {
  const turns: PodcastTurn[] = [];
  const lines = script.split("\n");
  const labels = [host1, host2].map((l) => l.toLowerCase());
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
    if (m) {
      const label = m[1].trim();
      if (labels.includes(label.toLowerCase()) || labels.some((l) => label.toLowerCase().includes(l))) {
        turns.push({ host: label, text: m[2].trim() });
        continue;
      }
    }
    // Non-dialogue line: append to previous turn if any (e.g. continuation).
    if (turns.length > 0) {
      turns[turns.length - 1].text += " " + line;
    }
  }
  return turns.filter((t) => t.text.trim());
}

interface TtsState {
  turns: PodcastTurn[];
  current: number; // index of the turn being spoken / about to be spoken
  playing: boolean;
  rate: number; // 0.5 - 2
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  host1VoiceURI: string | null;
  host2VoiceURI: string | null;
}

export function usePodcastTts() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [turns, setTurns] = useState<PodcastTurn[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [host1VoiceURI, setHost1VoiceURI] = useState<string | null>(null);
  const [host2VoiceURI, setHost2VoiceURI] = useState<string | null>(null);
  const queueRef = useRef<number>(0); // next index to speak
  const rateRef = useRef(rate);
  const host1Ref = useRef<string | null>(null);
  const host2Ref = useRef<string | null>(null);
  const turnsRef = useRef<PodcastTurn[]>([]);

  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { host1Ref.current = host1VoiceURI; }, [host1VoiceURI]);
  useEffect(() => { host2Ref.current = host2VoiceURI; }, [host2VoiceURI]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);

  // Load voices (they load asynchronously in some browsers).
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setVoices(v);
        // Pick two distinct default voices (prefer en voices).
        const en = v.filter((x) => x.lang.toLowerCase().startsWith("en"));
        const pool = en.length >= 2 ? en : v;
        setHost1VoiceURI((prev) => prev ?? pool[0]?.voiceURI ?? null);
        setHost2VoiceURI((prev) => prev ?? pool[1]?.voiceURI ?? pool[0]?.voiceURI ?? null);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  const loadScript = useCallback((script: string, host1: string, host2: string) => {
    window.speechSynthesis?.cancel();
    const parsed = parseScript(script, host1, host2);
    setTurns(parsed);
    queueRef.current = 0;
    setCurrent(0);
    setPlaying(false);
  }, []);

  const speakFrom = useCallback((idx: number) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    if (idx >= turnsRef.current.length) {
      setPlaying(false);
      return;
    }
    queueRef.current = idx;
    setCurrent(idx);
    setPlaying(true);

    const speakNext = () => {
      const i = queueRef.current;
      const t = turnsRef.current[i];
      if (!t) {
        setPlaying(false);
        return;
      }
      setCurrent(i);
      const u = new SpeechSynthesisUtterance(t.text);
      u.rate = rateRef.current;
      const isHost1 = t.host.toLowerCase().includes("a") || i % 2 === 0;
      const uri = isHost1 ? host1Ref.current : host2Ref.current;
      const voice = uri ? window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri) : null;
      if (voice) u.voice = voice;
      u.pitch = isHost1 ? 1.0 : 1.15;
      u.onend = () => {
        queueRef.current = i + 1;
        if (queueRef.current < turnsRef.current.length) {
          speakNext();
        } else {
          setPlaying(false);
        }
      };
      u.onerror = () => {
        setPlaying(false);
      };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  }, [supported]);

  const play = useCallback(() => {
    if (!supported || turnsRef.current.length === 0) return;
    // If paused mid-utterance, resume; else speak from current.
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPlaying(true);
    } else {
      speakFrom(current);
    }
  }, [supported, current, speakFrom]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPlaying(false);
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setPlaying(false);
    queueRef.current = 0;
    setCurrent(0);
  }, [supported]);

  const skip = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(turnsRef.current.length - 1, queueRef.current + delta));
    speakFrom(next);
  }, [speakFrom]);

  const seekTo = useCallback((idx: number) => {
    speakFrom(Math.max(0, Math.min(turnsRef.current.length - 1, idx)));
  }, [speakFrom]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    supported,
    turns,
    current,
    playing,
    rate,
    voices,
    host1VoiceURI,
    host2VoiceURI,
    setRate,
    setHost1VoiceURI,
    setHost2VoiceURI,
    loadScript,
    play,
    pause,
    stop,
    skip,
    seekTo,
  };
}

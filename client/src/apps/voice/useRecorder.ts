// ===== Shared microphone recorder hook =====
// Used by the Voice Notes app and the Quick Capture overlay.
// Wraps getUserMedia + MediaRecorder + a Web Audio AnalyserNode for live
// input-level metering. Produces a single Blob on stop (webm/ogg, whichever
// the browser supports).

import { useState, useRef, useCallback, useEffect } from "react";

export interface RecorderState {
  recording: boolean;
  paused: boolean;
  /** Elapsed recording time in seconds. */
  elapsed: number;
  /** Current input level 0..1 (RMS of the time-domain signal). */
  level: number;
  /** Error message (e.g. mic permission denied). */
  error: string | null;
  /** Whether the browser supports MediaRecorder. */
  supported: boolean;
}

export interface RecorderApi extends RecorderState {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** Stop and return the recorded audio Blob. */
  stop: () => Promise<Blob | null>;
  /** Reset state + clear error after a result has been consumed. */
  reset: () => void;
}

/** Pick the best supported MediaRecorder mime type. */
function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "";
}

export function useRecorder(): RecorderApi {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0); // seconds recorded before current run segment

  // Live level meter loop.
  const tickLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    setLevel(Math.min(1, rms * 2.2));
    rafRef.current = requestAnimationFrame(tickLevel);
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevel(0);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopMeter();
    stopTimer();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      for (const tr of streamRef.current.getTracks()) tr.stop();
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, [stopMeter, stopTimer]);

  // Cleanup on unmount.
  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    if (!supported) {
      setError("Audio recording is not supported in this browser.");
      return;
    }
    setError(null);
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setElapsed(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const err = e as Error;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Microphone permission denied. Allow mic access in your browser.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found.");
      } else {
        setError(err.message || "Could not access microphone.");
      }
      return;
    }
    streamRef.current = stream;

    // Set up the analyser for level metering.
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      rafRef.current = requestAnimationFrame(tickLevel);
    } catch {
      /* metering is optional */
    }

    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start(250); // collect chunks periodically
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setRecording(true);
    setPaused(false);

    timerRef.current = setInterval(() => {
      setElapsed(
        Math.floor(accumulatedRef.current + (Date.now() - startedAtRef.current) / 1000)
      );
    }, 250);
  }, [supported, tickLevel]);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.pause();
      accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
      stopTimer();
      setPaused(true);
    }
  }, [stopTimer]);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "paused") {
      rec.resume();
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(
          Math.floor(accumulatedRef.current + (Date.now() - startedAtRef.current) / 1000)
        );
      }, 250);
      setPaused(false);
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec) {
        teardown();
        setRecording(false);
        setPaused(false);
        resolve(null);
        return;
      }
      // Finalize elapsed time.
      if (rec.state === "recording") {
        accumulatedRef.current += (Date.now() - startedAtRef.current) / 1000;
      }
      setElapsed(Math.floor(accumulatedRef.current));

      rec.onstop = () => {
        const mime = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        teardown();
        setRecording(false);
        setPaused(false);
        resolve(blob.size > 0 ? blob : null);
      };
      if (rec.state !== "inactive") rec.stop();
      else {
        teardown();
        setRecording(false);
        resolve(null);
      }
    });
  }, [teardown]);

  const reset = useCallback(() => {
    setError(null);
    setElapsed(0);
    setLevel(0);
  }, []);

  return {
    recording,
    paused,
    elapsed,
    level,
    error,
    supported,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}

/** Format seconds as M:SS. */
export function fmtDuration(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

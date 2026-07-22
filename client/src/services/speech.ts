// ===== Web Speech API wrapper for live lesson transcription =====
// Browser-native SpeechRecognition (Chromium-only). Free, no key.
// Cannot transcribe uploaded audio files — mic input only.

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string; confidence: number };
    isFinal: boolean;
    length: number;
  }> & { length: number };
};

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getCtor() !== null;
}

export interface SpeechTranscriber {
  start(): void;
  stop(): void;
  /** Subscribe to transcript updates. Returns an unsubscribe fn. */
  onUpdate(cb: (state: { interim: string; final: string }) => void): () => void;
  /** Subscribe to errors. */
  onError(cb: (msg: string) => void): () => void;
  /** Subscribe to end events (recognition stopped/ended). */
  onEnd(cb: () => void): () => void;
  readonly running: boolean;
}

export function createTranscriber(lang = "en-US"): SpeechTranscriber {
  const Ctor = getCtor();
  if (!Ctor) throw new Error("SpeechRecognition is not supported in this browser.");

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang;

  let finalText = "";
  let interimText = "";
  let running = false;

  const updateCbs = new Set<(s: { interim: string; final: string }) => void>();
  const errorCbs = new Set<(msg: string) => void>();
  const endCbs = new Set<() => void>();

  const emit = () =>
    updateCbs.forEach((cb) => cb({ interim: interimText, final: finalText }));

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const transcript = r[0].transcript;
      if (r.isFinal) {
        finalText += transcript;
      } else {
        interim += transcript;
      }
    }
    interimText = interim;
    emit();
  };

  rec.onerror = (e) => {
    const msg = e.message ?? e.error ?? "Speech recognition error";
    errorCbs.forEach((cb) => cb(msg));
  };

  rec.onend = () => {
    running = false;
    // Flush any pending interim into final so nothing is lost.
    if (interimText.trim()) {
      finalText += (finalText && !finalText.endsWith(" ") ? " " : "") + interimText.trim();
      interimText = "";
      emit();
    }
    endCbs.forEach((cb) => cb());
  };

  rec.onstart = () => {
    running = true;
  };

  return {
    start: () => {
      if (running) return;
      finalText = "";
      interimText = "";
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
    onUpdate: (cb) => {
      updateCbs.add(cb);
      cb({ interim: interimText, final: finalText });
      return () => updateCbs.delete(cb);
    },
    onError: (cb) => {
      errorCbs.add(cb);
      return () => errorCbs.delete(cb);
    },
    onEnd: (cb) => {
      endCbs.add(cb);
      return () => endCbs.delete(cb);
    },
    get running() {
      return running;
    },
  };
}

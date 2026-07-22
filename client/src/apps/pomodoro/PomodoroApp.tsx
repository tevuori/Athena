import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, SkipForward, Coffee, Brain, Volume2, VolumeX } from "lucide-react";
import { useSettings } from "../../store/settings";
import type { WindowInstance } from "../../store/windows";

type Phase = "focus" | "short-break" | "long-break";

const PHASE_CONFIG: Record<Phase, { label: string; minutes: number; color: string; icon: React.ReactNode }> = {
  "focus": { label: "Focus", minutes: 25, color: "#ef4444", icon: <Brain size={18} /> },
  "short-break": { label: "Short Break", minutes: 5, color: "#22c55e", icon: <Coffee size={18} /> },
  "long-break": { label: "Long Break", minutes: 15, color: "#3b82f6", icon: <Coffee size={18} /> },
};

interface SessionStats {
  completedFocus: number;
  totalFocusMinutes: number;
  date: string; // YYYY-MM-DD
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStats(): SessionStats {
  try {
    const raw = localStorage.getItem("pomodoro-stats");
    if (raw) {
      const stats = JSON.parse(raw) as SessionStats;
      if (stats.date === todayKey()) return stats;
    }
  } catch { /* ignore */ }
  return { completedFocus: 0, totalFocusMinutes: 0, date: todayKey() };
}

function saveStats(stats: SessionStats) {
  localStorage.setItem("pomodoro-stats", JSON.stringify(stats));
}

export default function PomodoroApp({ win }: { win: WindowInstance }) {
  const [phase, setPhase] = useState<Phase>("focus");
  const [secondsLeft, setSecondsLeft] = useState(PHASE_CONFIG["focus"].minutes * 60);
  const [running, setRunning] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [stats, setStats] = useState<SessionStats>(loadStats);
  const [muted, setMuted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { setDoNotDisturb } = useSettings();

  // Honor an auto-start payload sent by the Athena assistant (start_pomodoro).
  useEffect(() => {
    const p = win?.payload as
      | { autoStart?: boolean; phase?: string; durationMinutes?: number }
      | undefined;
    if (!p) return;
    const map: Record<string, Phase> = {
      work: "focus",
      focus: "focus",
      short_break: "short-break",
      "short-break": "short-break",
      long_break: "long-break",
      "long-break": "long-break",
    };
    const target = (p.phase && map[p.phase]) || "focus";
    setPhase(target);
    setSecondsLeft(
      p.durationMinutes && p.durationMinutes > 0
        ? Math.round(p.durationMinutes * 60)
        : PHASE_CONFIG[target].minutes * 60
    );
    if (p.autoStart) setRunning(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const config = PHASE_CONFIG[phase];
  const totalSeconds = config.minutes * 60;
  const progress = 1 - secondsLeft / totalSeconds;

  // Play a notification sound
  const playSound = useCallback(() => {
    if (muted) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }, [muted]);

  // Transition to next phase
  const nextPhase = useCallback(() => {
    setRunning(false);
    playSound();
    if (phase === "focus") {
      const newStats = {
        ...stats,
        completedFocus: stats.completedFocus + 1,
        totalFocusMinutes: stats.totalFocusMinutes + config.minutes,
      };
      setStats(newStats);
      saveStats(newStats);
      // Every 4 focus sessions → long break
      const next: Phase = (newStats.completedFocus % 4 === 0) ? "long-break" : "short-break";
      setPhase(next);
      setSecondsLeft(PHASE_CONFIG[next].minutes * 60);
    } else {
      setPhase("focus");
      setSecondsLeft(PHASE_CONFIG["focus"].minutes * 60);
    }
  }, [phase, stats, config.minutes, playSound]);

  // Timer tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          nextPhase();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, nextPhase]);

  // DND integration: when running in focus mode, enable DND
  useEffect(() => {
    if (dndEnabled && running && phase === "focus") {
      setDoNotDisturb(true);
    } else if (dndEnabled) {
      setDoNotDisturb(false);
    }
    // Restore DND on unmount
    return () => {
      if (dndEnabled) setDoNotDisturb(false);
    };
  }, [dndEnabled, running, phase, setDoNotDisturb]);

  const switchPhase = (p: Phase) => {
    setRunning(false);
    setPhase(p);
    setSecondsLeft(PHASE_CONFIG[p].minutes * 60);
  };

  const reset = () => {
    setRunning(false);
    setSecondsLeft(config.minutes * 60);
  };

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const ss = (secondsLeft % 60).toString().padStart(2, "0");

  // SVG circle parameters
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex h-full flex-col items-center bg-gradient-to-b from-surface to-surface-2 p-6">
      {/* Phase tabs */}
      <div className="mb-6 flex gap-1 rounded-full bg-surface-2 p-1">
        {(Object.keys(PHASE_CONFIG) as Phase[]).map((p) => (
          <button
            key={p}
            onClick={() => switchPhase(p)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition ${
              phase === p ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
            }`}
          >
            {PHASE_CONFIG[p].icon}
            {PHASE_CONFIG[p].label}
          </button>
        ))}
      </div>

      {/* Timer circle */}
      <div className="relative mb-6 flex items-center justify-center">
        <svg width="280" height="280" className="-rotate-90">
          {/* Background ring */}
          <circle
            cx="140" cy="140" r={radius}
            fill="none" stroke="currentColor"
            strokeWidth="10" className="text-surface-3"
          />
          {/* Progress ring */}
          <motion.circle
            cx="140" cy="140" r={radius}
            fill="none" stroke={config.color}
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mb-1 flex items-center gap-1.5 text-sm font-medium"
              style={{ color: config.color }}
            >
              {config.icon}
              {config.label}
            </motion.div>
          </AnimatePresence>
          <div className="font-mono text-5xl font-bold tabular-nums text-ink">
            {mm}:{ss}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {running ? "Running..." : "Ready"}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-muted transition hover:bg-surface-3 hover:text-ink"
          title="Reset"
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 active:scale-95"
          style={{ backgroundColor: config.color }}
          title={running ? "Pause" : "Start"}
        >
          {running ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
        </button>
        <button
          onClick={nextPhase}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-muted transition hover:bg-surface-3 hover:text-ink"
          title="Skip"
        >
          <SkipForward size={18} />
        </button>
      </div>

      {/* Options */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setDndEnabled((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            dndEnabled ? "bg-accent/20 text-accent" : "bg-surface-2 text-ink-muted hover:text-ink"
          }`}
        >
          {dndEnabled ? <VolumeX size={14} /> : <Volume2 size={14} />}
          Auto DND {dndEnabled ? "On" : "Off"}
        </button>
        <button
          onClick={() => setMuted((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            muted ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink hover:bg-surface-3"
          }`}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          Sound {muted ? "Off" : "On"}
        </button>
      </div>

      {/* Session stats */}
      <div className="mt-auto w-full rounded-xl border border-edge bg-surface-2 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Today</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-ink">{stats.completedFocus}</p>
            <p className="text-xs text-ink-muted">Sessions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-ink">{stats.totalFocusMinutes}</p>
            <p className="text-xs text-ink-muted">Minutes focused</p>
          </div>
        </div>
        {/* Dots showing session progress toward long break */}
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition ${
                i < stats.completedFocus % 4 || (stats.completedFocus > 0 && stats.completedFocus % 4 === 0)
                  ? "bg-accent"
                  : "bg-surface-3"
              }`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-ink-muted">
          {stats.completedFocus % 4 === 0 && stats.completedFocus > 0
            ? "Long break earned!"
            : `${4 - (stats.completedFocus % 4)} sessions until long break`}
        </p>
      </div>
    </div>
  );
}

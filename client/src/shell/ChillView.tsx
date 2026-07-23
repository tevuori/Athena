// ===== ChillView — fullscreen immersive music mode =====
// Blurred album art background + beat-reactive canvas.
// Large album art (vinyl-style CSS rotation when playing), centered synced
// lyrics with glow on the active line, full controls at the bottom.
// ESC or click exit button to leave.
//
// Performance: the main ChillView only re-renders when the track or play
// state changes (infrequent). The progress bar + lyric highlight are in a
// separate <ProgressAndLyrics> component with its own 500ms interpolation
// loop, so the heavy stuff (canvas, vinyl, track info) doesn't re-render
// on every position tick.

import { useState, useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Loader2, Music as MusicIcon,
  X, Minimize2,
} from "lucide-react";
import { useMusic } from "../store/music";
import { findActiveLine, type LyricsLine } from "../services/lyrics";
import ChillBackground, { type ChillColors } from "./ChillBackground";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ===== Color extraction from album art =====

interface ExtractedColors {
  dominant: string;
  accent: string;
  raw: ChillColors;
}

function extractColors(imgUrl: string): Promise<ExtractedColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let bestDominant = { r: 20, g: 20, b: 30, count: 0 };
        let bestAccent = { r: 99, g: 102, b: 241, sat: 0 };
        let bestSecondary = { r: 168, g: 85, b: 247, sat: 0 };

        const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.count++;
            existing.r = (existing.r * (existing.count - 1) + r) / existing.count;
            existing.g = (existing.g * (existing.count - 1) + g) / existing.count;
            existing.b = (existing.b * (existing.count - 1) + b) / existing.count;
          } else {
            buckets.set(key, { r, g, b, count: 1 });
          }
        }

        for (const { r, g, b, count } of buckets.values()) {
          if (count > bestDominant.count) {
            bestDominant = { r, g, b, count };
          }
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const brightness = (r + g + b) / 3;
          const score = sat * (1 - Math.abs(brightness - 128) / 128);
          if (score > bestAccent.sat) {
            bestSecondary = bestAccent;
            bestAccent = { r, g, b, sat: score };
          } else if (score > bestSecondary.sat) {
            bestSecondary = { r, g, b, sat: score };
          }
        }

        const domR = Math.round(bestDominant.r * 0.3);
        const domG = Math.round(bestDominant.g * 0.3);
        const domB = Math.round(bestDominant.b * 0.3);
        const accR = Math.min(255, Math.round(bestAccent.r));
        const accG = Math.min(255, Math.round(bestAccent.g));
        const accB = Math.min(255, Math.round(bestAccent.b));
        const secR = Math.min(255, Math.round(bestSecondary.r));
        const secG = Math.min(255, Math.round(bestSecondary.g));
        const secB = Math.min(255, Math.round(bestSecondary.b));

        resolve({
          dominant: `rgb(${domR}, ${domG}, ${domB})`,
          accent: `rgb(${accR}, ${accG}, ${accB})`,
          raw: {
            dominant: { r: domR, g: domG, b: domB },
            accent: { r: accR, g: accG, b: accB },
            secondary: { r: secR, g: secG, b: secB },
          },
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imgUrl;
  });
}

// ===== Progress bar + lyrics (re-renders every 500ms) =====
// Isolated so the parent ChillView doesn't re-render on every position tick.

interface ProgressAndLyricsProps {
  lyrics: LyricsLine[];
  lyricsLoading: boolean;
  lyricsError: string | null;
  duration: number;
  accentColor: string;
  isPlaying: boolean;
  onSeek: (ms: number) => void;
}

function ProgressAndLyricsInner({
  lyrics, lyricsLoading, lyricsError, duration, accentColor, isPlaying, onSeek,
}: ProgressAndLyricsProps) {
  const [localPos, setLocalPos] = useState(0);
  const [activeLineIdx, setActiveLineIdx] = useState(-1);
  const lyricListRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const lastActiveLine = useRef(-1);

  // Position interpolation — updates DOM directly via refs to avoid
  // re-rendering the entire lyric list every 500ms.
  useEffect(() => {
    const tick = () => {
      const store = useMusic.getState();
      let pos: number;
      if (store.state?.is_playing && store.positionUpdatedAt > 0) {
        pos = store.positionMs + (Date.now() - store.positionUpdatedAt);
      } else {
        pos = store.positionMs;
      }

      // Update progress bar via refs (no re-render)
      const pct = duration ? (pos / duration) * 100 : 0;
      if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
      if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`;
      if (currentTimeRef.current) currentTimeRef.current.textContent = fmt(pos);

      // Update active lyric line
      const newIdx = findActiveLine(lyrics, pos / 1000);
      if (newIdx !== lastActiveLine.current) {
        lastActiveLine.current = newIdx;
        setActiveLineIdx(newIdx);
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lyrics, duration]);

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeLineIdx < 0 || !lyricListRef.current) return;
    const container = lyricListRef.current;
    const el = container.querySelector(`[data-line="${activeLineIdx}"]`) as HTMLElement | null;
    if (!el) return;
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: target, behavior: "smooth" });
  }, [activeLineIdx]);

  return (
    <>
      {/* Lyrics */}
      <div
        ref={lyricListRef}
        className="flex-1 overflow-y-auto px-4 text-center"
        style={{ maxHeight: "calc(100vh - 340px)", scrollbarWidth: "none" }}
      >
        {lyricsLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={28} className="animate-spin text-white/40" />
          </div>
        ) : lyricsError ? (
          <div className="flex h-32 flex-col items-center justify-center text-white/40">
            <MusicIcon size={32} className="mb-2 opacity-50" />
            <p className="text-sm">{lyricsError}</p>
          </div>
        ) : lyrics.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-white/40">
            No lyrics for this track
          </div>
        ) : (
          <div className="py-8">
            {lyrics.map((line, i) => {
              const distance = Math.abs(i - activeLineIdx);
              const opacity = i === activeLineIdx ? 1 : Math.max(0.15, 0.5 - distance * 0.08);
              return (
                <p
                  key={i}
                  data-line={i}
                  className="py-2 transition-all duration-300"
                  style={{
                    fontSize: i === activeLineIdx ? "1.5rem" : "1.1rem",
                    fontWeight: i === activeLineIdx ? 700 : 400,
                    color: i === activeLineIdx ? "#ffffff" : `rgba(255, 255, 255, ${opacity})`,
                    textShadow: i === activeLineIdx
                      ? `0 0 30px ${accentColor}80, 0 0 60px ${accentColor}40`
                      : "none",
                    transform: i === activeLineIdx ? "scale(1.02)" : "scale(1)",
                  }}
                >
                  {line.text || "♪"}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress bar + controls */}
      <div className="px-8 pb-8 pt-2">
        <div className="mx-auto mb-4 max-w-2xl">
          <div
            ref={progressBarRef}
            className="group relative h-1.5 cursor-pointer rounded-full bg-white/10"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              onSeek(Math.round(pct * duration));
            }}
          >
            <div
              ref={progressFillRef}
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: "0%",
                background: `linear-gradient(90deg, ${accentColor}, #ffffff)`,
              }}
            />
            <div
              ref={progressThumbRef}
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
              style={{ left: "0%" }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-white/50">
            <span ref={currentTimeRef} className="tabular-nums">0:00</span>
            <span className="tabular-nums">{fmt(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <ControlsBar isPlaying={isPlaying} />
      </div>
    </>
  );
}

const ProgressAndLyrics = memo(ProgressAndLyricsInner);

// ===== Controls bar (separate to avoid re-rendering on position ticks) =====

function ControlsBar({ isPlaying }: { isPlaying: boolean }) {
  const { togglePlay, next, previous, setChilling } = useMusic();
  return (
    <>
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => previous()}
          className="flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition hover:scale-110 hover:text-white"
          title="Previous"
        >
          <SkipBack size={24} fill="currentColor" />
        </button>
        <button
          onClick={() => togglePlay()}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-2xl transition hover:scale-105"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause size={28} fill="currentColor" />
          ) : (
            <Play size={28} fill="currentColor" className="ml-1" />
          )}
        </button>
        <button
          onClick={() => next()}
          className="flex h-12 w-12 items-center justify-center rounded-full text-white/70 transition hover:scale-110 hover:text-white"
          title="Next"
        >
          <SkipForward size={24} fill="currentColor" />
        </button>
      </div>
      <div className="mt-4 flex justify-center">
        <button
          onClick={() => setChilling(false)}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/60 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
        >
          <Minimize2 size={12} /> Back to widget
        </button>
      </div>
    </>
  );
}

// ===== Main component =====

export default function ChillView() {
  const {
    chilling, state, lyrics, lyricsLoading, lyricsError,
    togglePlay, setChilling,
  } = useMusic();

  const [colors, setColors] = useState<ExtractedColors | null>(null);

  const track = state?.item;
  const isPlaying = state?.is_playing ?? false;
  const duration = track?.duration_ms ?? 0;
  const albumArt = track?.album.images?.[0]?.url;

  // Extract colors when album art changes
  useEffect(() => {
    if (!albumArt) { setColors(null); return; }
    let cancelled = false;
    extractColors(albumArt).then((c) => {
      if (!cancelled) setColors(c);
    });
    return () => { cancelled = true; };
  }, [albumArt]);

  // ESC to exit + spacebar play/pause
  useEffect(() => {
    if (!chilling) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setChilling(false);
      }
      if (e.key === " " && !(e.target as HTMLElement)?.matches("input, textarea")) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chilling, togglePlay, setChilling]);

  if (!chilling || !track) return null;

  const accentColor = colors?.accent ?? "rgb(99, 102, 241)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[20000] flex flex-col overflow-hidden"
    >
      {/* Layer 1: Blurred album art */}
      {albumArt && (
        <div
          className="absolute inset-0 scale-125 bg-cover bg-center"
          style={{
            backgroundImage: `url(${albumArt})`,
            filter: "blur(80px) saturate(1.3)",
            opacity: 0.4,
          }}
        />
      )}

      {/* Layer 2: Beat-reactive canvas */}
      <ChillBackground
        colors={colors?.raw ?? null}
        isPlaying={isPlaying}
        albumArt={albumArt}
        lyricBeat={-1}
      />

      {/* Layer 3: Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative flex h-full flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <span className="flex h-2 w-2 rounded-full" style={{ background: isPlaying ? "#22c55e" : "#666" }} />
            {state?.device?.name ?? "Spotify"}
          </div>
          <button
            onClick={() => setChilling(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
            title="Exit chill mode (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main area: vinyl (left) + track info + lyrics (right) */}
        <div className="flex flex-1 items-center justify-center gap-12 px-8 pb-4">
          {/* Vinyl — CSS animation, no Framer Motion rotation */}
          <div className="hidden shrink-0 items-center justify-center md:flex">
            <div
              className="relative"
              style={{
                animation: "chill-vinyl-spin 20s linear infinite",
                animationPlayState: isPlaying ? "running" : "paused",
              }}
            >
              {/* Vinyl disc */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${accentColor}40 0%, transparent 30%), repeating-radial-gradient(circle, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 4px)`,
                  transform: "scale(1.15)",
                }}
              />
              {/* Album image */}
              <div className="relative h-64 w-64 overflow-hidden rounded-full border-4 border-white/10 shadow-2xl">
                {albumArt ? (
                  <img src={albumArt} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/5">
                    <MusicIcon size={48} className="text-white/30" />
                  </div>
                )}
              </div>
              {/* Center hole */}
              <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 ring-2 ring-white/10" />
            </div>
          </div>

          {/* Track info + lyrics + progress + controls */}
          <div className="flex max-w-xl flex-1 flex-col items-center">
            {/* Track name (mobile) */}
            <div className="mb-6 text-center md:hidden">
              <h2 className="text-2xl font-bold text-white">{track.name}</h2>
              <p className="mt-1 text-sm text-white/60">
                {track.artists.map((a) => a.name).join(", ")}
              </p>
            </div>

            {/* Track name (desktop) */}
            <div className="mb-8 hidden text-center md:block">
              <h2 className="text-3xl font-bold text-white drop-shadow-lg">{track.name}</h2>
              <p className="mt-2 text-base text-white/60">
                {track.artists.map((a) => a.name).join(", ")}
              </p>
              <p className="mt-0.5 text-xs text-white/40">{track.album.name}</p>
            </div>

            {/* Lyrics + progress bar + controls (isolated re-renders) */}
            <ProgressAndLyrics
              lyrics={lyrics}
              lyricsLoading={lyricsLoading}
              lyricsError={lyricsError}
              duration={duration}
              accentColor={accentColor}
              isPlaying={isPlaying}
              onSeek={(ms) => useMusic.getState().seek(ms)}
            />
          </div>
        </div>
      </div>

      {/* CSS keyframes for vinyl rotation */}
      <style>{`
        @keyframes chill-vinyl-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
}

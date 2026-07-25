import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, SkipForward, SkipBack, ChevronDown } from "lucide-react";
import { useMusic } from "../../store/music";
import { findActiveLine } from "../../services/lyrics";
import { useNowPlaying } from "./nowPlayingStore";

/**
 * Full now-playing sheet that expands from the MiniPlayer. Shows large album
 * art, synced lyrics (auto-scrolling), playback controls, and a seek bar.
 *
 * State is driven by the existing `useMusic` store (polling-only, no SDK) and
 * the local `useNowPlaying` open/close store shared with MiniPlayer.
 */
export default function NowPlayingSheet() {
  const open = useNowPlaying((s) => s.open);
  const setOpen = useNowPlaying((s) => s.setOpen);
  const { connection, state, lyrics, lyricsLoading, lyricsError, togglePlay, next, previous, seek, positionMs, positionUpdatedAt } = useMusic();

  const lyricsRef = useRef<HTMLDivElement>(null);

  if (connection !== "ready" || !state?.item) return null;
  const track = state.item;
  const isPlaying = state.is_playing;
  const art = track.album?.images?.[0]?.url;
  const durationMs = track.duration_ms;

  // Estimate current position from the last server update + elapsed time.
  const elapsed = Date.now() - positionUpdatedAt;
  const posMs = isPlaying ? Math.min(durationMs, positionMs + elapsed) : positionMs;
  const posSec = posMs / 1000;
  const activeIdx = findActiveLine(lyrics, posSec);

  useEffect(() => {
    if (!open || !lyricsRef.current) return;
    const el = lyricsRef.current.querySelector<HTMLElement>(`[data-lyric-idx="${activeIdx}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx, open]);

  const progressPct = durationMs > 0 ? (posMs / durationMs) * 100 : 0;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-black/70"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 360 }}
            className="safe-top safe-bottom absolute inset-0 z-[61] flex flex-col bg-gradient-to-b from-surface-2 to-surface"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3">
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
              >
                <ChevronDown size={22} />
              </button>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Now Playing
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
              >
                <X size={20} />
              </button>
            </div>

            {/* Album art */}
            <div className="flex justify-center px-6 pt-4">
              {art ? (
                <img
                  src={art}
                  alt=""
                  className="h-64 w-64 rounded-2xl object-cover shadow-2xl"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-surface-3 text-ink-muted">
                  <Play size={48} />
                </div>
              )}
            </div>

            {/* Track info */}
            <div className="px-6 pt-5 text-center">
              <p className="truncate text-xl font-bold text-ink">{track.name}</p>
              <p className="mt-1 truncate text-sm text-ink-muted">
                {track.artists?.map((a) => a.name).join(", ")}
              </p>
              <p className="truncate text-xs text-ink-muted/70">{track.album?.name}</p>
            </div>

            {/* Seek bar */}
            <div className="px-6 pt-5">
              <div
                className="group relative h-1.5 cursor-pointer rounded-full bg-surface-3"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  seek(pct * durationMs);
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-accent"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-ink-muted">
                <span>{fmt(posMs)}</span>
                <span>{fmt(durationMs)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-8 px-6 pt-4">
              <button
                onClick={() => previous()}
                className="flex h-12 w-12 items-center justify-center rounded-full text-ink active:scale-90"
              >
                <SkipBack size={26} className="fill-current" />
              </button>
              <button
                onClick={() => togglePlay()}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-fg active:scale-95"
              >
                {isPlaying ? <Pause size={30} className="fill-current" /> : <Play size={30} className="fill-current" />}
              </button>
              <button
                onClick={() => next()}
                className="flex h-12 w-12 items-center justify-center rounded-full text-ink active:scale-90"
              >
                <SkipForward size={26} className="fill-current" />
              </button>
            </div>

            {/* Lyrics */}
            <div ref={lyricsRef} className="flex-1 overflow-y-auto px-6 pt-5 pb-8 text-center">
              {lyricsLoading ? (
                <p className="text-sm text-ink-muted">Loading lyrics…</p>
              ) : lyricsError ? (
                <p className="text-sm text-ink-muted">{lyricsError}</p>
              ) : lyrics.length === 0 ? (
                <p className="text-sm text-ink-muted">No lyrics</p>
              ) : (
                lyrics.map((line, i) => (
                  <p
                    key={i}
                    data-lyric-idx={i}
                    className={`py-1.5 text-base transition ${
                      i === activeIdx
                        ? "font-semibold text-ink"
                        : "text-ink-muted/60"
                    }`}
                  >
                    {line.text || "♪"}
                  </p>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

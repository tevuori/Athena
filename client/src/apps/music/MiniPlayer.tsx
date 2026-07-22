import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, SkipForward, X, Maximize2 } from "lucide-react";
import { useMusic } from "../../store/music";
import { useWindows } from "../../store/windows";
import { findActiveLine } from "../../services/lyrics";

/** Floating draggable mini-player widget overlaying the desktop. */
export default function MiniPlayer() {
  const { showMiniPlayer, state, positionMs, lyrics, togglePlay, next, setShowMiniPlayer } = useMusic();
  const { open } = useWindows();
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const track = state?.item;
  const activeIdx = findActiveLine(lyrics, positionMs / 1000);
  const currentLine = activeIdx >= 0 ? lyrics[activeIdx]?.text : "♪";

  // Position poll for lyric line
  useEffect(() => {
    if (!showMiniPlayer) return;
    const tick = async () => {
      const player = useMusic.getState().player;
      if (player) {
        const s = await player.getCurrentState();
        if (s) useMusic.getState().setPosition(s.position);
      }
    };
    const id = window.setInterval(tick, 500);
    return () => clearInterval(id);
  }, [showMiniPlayer]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.max(0, Math.min(d.posX + e.clientX - d.startX, window.innerWidth - 280));
    const y = Math.max(0, Math.min(d.posY + e.clientY - d.startY, window.innerHeight - 100));
    setPos({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  return (
    <AnimatePresence>
      {showMiniPlayer && track && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed z-[13000] flex w-72 items-center gap-3 rounded-xl border border-edge bg-surface/95 p-2.5 shadow-window backdrop-blur-xl"
          style={{ left: pos.x, top: pos.y }}
        >
          {/* Album art (drag handle) */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="h-14 w-14 shrink-0 cursor-grab overflow-hidden rounded-lg bg-surface-3 active:cursor-grabbing"
          >
            {track.album.images?.[0]?.url ? (
              <img src={track.album.images[0].url} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>

          {/* Track + lyric */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink">{track.name}</p>
            <p className="truncate text-[10px] text-ink-muted">
              {track.artists.map((a) => a.name).join(", ")}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-accent">{currentLine}</p>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => togglePlay()}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-surface-3"
            >
              {state?.is_playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <button
              onClick={() => next()}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-surface-3"
            >
              <SkipForward size={13} fill="currentColor" />
            </button>
            <button
              onClick={() => {
                setShowMiniPlayer(false);
                open({ appId: "music", title: "Music", icon: "Music" });
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface-3 hover:text-ink"
              title="Expand"
            >
              <Maximize2 size={12} />
            </button>
            <button
              onClick={() => setShowMiniPlayer(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-red-500 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

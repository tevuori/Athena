import { Play, Pause, SkipForward } from "lucide-react";
import { useMusic } from "../../store/music";

/**
 * Compact music player bar that sits just above the bottom nav when music
 * is playing. Single line: album art + title/artist + play/pause + skip.
 * Tap to expand (TODO: open a full now-playing sheet reusing ChillView).
 */
export default function MiniPlayer() {
  const { connection, state, togglePlay, next } = useMusic();

  if (connection !== "ready" || !state?.item) return null;
  const track = state.item;
  const isPlaying = state.is_playing;
  const art = track.album?.images?.[0]?.url;

  return (
    <div className="safe-left safe-right mx-2 mb-1 flex shrink-0 items-center gap-2 rounded-xl border border-edge bg-surface-2/95 px-2 py-1.5 backdrop-blur">
      {art ? (
        <img src={art} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-md bg-surface-3" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">{track.name}</p>
        <p className="truncate text-[10px] text-ink-muted">
          {track.artists?.map((a) => a.name).join(", ")}
        </p>
      </div>
      <button
        onClick={() => togglePlay()}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink active:bg-surface-3"
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <button
        onClick={() => next()}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink active:bg-surface-3"
      >
        <SkipForward size={16} />
      </button>
    </div>
  );
}

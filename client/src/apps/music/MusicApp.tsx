import { useState, useEffect, useRef } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Loader2,
  Music, AlertCircle, Search, Minimize2, RefreshCw, Mic,
} from "lucide-react";
import { useMusic } from "../../store/music";
import { useSettings } from "../../store/settings";
import { lyricsApi, parseLrc, findActiveLine } from "../../services/lyrics";
import type { LyricsResult } from "../../types";
import type { WindowInstance } from "../../store/windows";
import MiniPlayer from "./MiniPlayer";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function MusicApp(_: { win: WindowInstance }) {
  const {
    connection, error, state, positionMs, lyrics, lyricsLoading, lyricsError,
    init, togglePlay, next, previous, seek, setVolume, refreshState, setShowMiniPlayer,
  } = useMusic();
  const { volume, setVolume: setGlobalVolume } = useSettings();
  const [showSearch, setShowSearch] = useState(false);
  const pollRef = useRef<number | undefined>(undefined);

  // Auto-init on mount
  useEffect(() => {
    if (connection === "idle") init();
  }, [connection, init]);

  // Poll position for smooth progress + lyric sync (every 500ms)
  useEffect(() => {
    if (connection !== "ready") return;
    const tick = async () => {
      const player = useMusic.getState().player;
      if (player) {
        const s = await player.getCurrentState();
        if (s) {
          useMusic.getState().setPosition(s.position);
        }
      }
    };
    pollRef.current = window.setInterval(tick, 500);
    return () => clearInterval(pollRef.current);
  }, [connection]);

  const track = state?.item;
  const isPlaying = state?.is_playing ?? false;
  const duration = track?.duration_ms ?? 0;
  const progress = positionMs;

  // Active lyric line
  const activeLineIdx = findActiveLine(lyrics, progress / 1000);
  const lyricListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLineIdx < 0 || !lyricListRef.current) return;
    const el = lyricListRef.current.querySelector(`[data-line="${activeLineIdx}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLineIdx]);

  if (connection === "not-configured") {
    return (
      <Center>
        <AlertCircle size={40} className="mb-3 text-amber-400" />
        <h3 className="text-base font-semibold text-ink">Spotify not configured</h3>
        <p className="mt-1 max-w-xs text-center text-sm text-ink-muted">
          Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN
          in the server's .env file.
        </p>
      </Center>
    );
  }

  if (connection === "connecting" || connection === "idle") {
    return (
      <Center>
        <Loader2 size={32} className="mb-3 animate-spin text-accent" />
        <p className="text-sm text-ink-muted">Connecting to Spotify...</p>
      </Center>
    );
  }

  if (connection === "error") {
    return (
      <Center>
        <AlertCircle size={40} className="mb-3 text-red-400" />
        <h3 className="text-base font-semibold text-ink">Connection error</h3>
        <p className="mt-1 max-w-xs text-center text-sm text-ink-muted">{error}</p>
        <button
          onClick={() => init()}
          className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </Center>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Now playing header */}
      <div className="flex items-center gap-4 border-b border-edge p-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-3">
          {track?.album.images?.[0]?.url ? (
            <img src={track.album.images[0].url} alt={track.album.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-muted">
              <Music size={28} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">{track?.name ?? "Nothing playing"}</p>
          <p className="truncate text-sm text-ink-muted">
            {track?.artists.map((a) => a.name).join(", ") ?? "—"}
          </p>
          <p className="truncate text-xs text-ink-muted/70">{track?.album.name ?? ""}</p>
        </div>
        <button
          onClick={() => setShowMiniPlayer(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink"
          title="Mini player"
        >
          <Minimize2 size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={progress}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full accent-accent"
          disabled={!track}
        />
        <div className="flex justify-between text-[11px] text-ink-muted">
          <span>{fmt(progress)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 py-3">
        <button
          onClick={() => previous()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-3"
          title="Previous"
        >
          <SkipBack size={18} fill="currentColor" />
        </button>
        <button
          onClick={() => togglePlay()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg hover:opacity-90"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button
          onClick={() => next()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-3"
          title="Next"
        >
          <SkipForward size={18} fill="currentColor" />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <button
          onClick={() => {
            const v = volume === 0 ? 70 : 0;
            setGlobalVolume(v);
            setVolume(v);
          }}
          className="text-ink-muted hover:text-ink"
        >
          {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setGlobalVolume(v);
            setVolume(v);
          }}
          className="flex-1 accent-accent"
        />
        <button
          onClick={() => setShowSearch((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3 hover:text-ink"
          title="Search lyrics"
        >
          <Search size={14} />
        </button>
      </div>

      {/* Lyrics */}
      <div className="flex-1 overflow-hidden border-t border-edge">
        {showSearch ? (
          <LyricsSearch
            track={track ?? null}
            onClose={() => setShowSearch(false)}
            onPicked={(result) => {
              useMusic.setState({
                lyrics: parseLrc(result.syncedLyrics),
                lyricsError: null,
              });
              if (track?.id) {
                lyricsApi.cache(track.id, result).catch(() => {});
              }
              setShowSearch(false);
            }}
          />
        ) : (
          <div ref={lyricListRef} className="h-full overflow-y-auto px-6 py-4 text-center">
            {lyricsLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 size={20} className="animate-spin text-ink-muted" />
              </div>
            ) : lyricsError ? (
              <div className="flex h-full flex-col items-center justify-center text-ink-muted">
                {lyricsError === "Instrumental track" ? (
                  <Mic size={32} className="mb-2 opacity-40" />
                ) : (
                  <Music size={32} className="mb-2 opacity-40" />
                )}
                <p className="text-sm">{lyricsError}</p>
                <button
                  onClick={() => setShowSearch(true)}
                  className="mt-3 rounded-lg border border-edge px-3 py-1.5 text-xs text-ink hover:bg-surface-2"
                >
                  Search manually
                </button>
              </div>
            ) : lyrics.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                No lyrics loaded
              </div>
            ) : (
              lyrics.map((line, i) => (
                <p
                  key={i}
                  data-line={i}
                  className={`py-1.5 text-sm transition-all duration-200 ${
                    i === activeLineIdx
                      ? "scale-105 font-semibold text-accent"
                      : "text-ink-muted/60"
                  }`}
                >
                  {line.text || "♪"}
                </p>
              ))
            )}
          </div>
        )}
      </div>

      <MiniPlayer />
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      {children}
    </div>
  );
}

function LyricsSearch({
  track,
  onClose,
  onPicked,
}: {
  track: { name: string; artists: { name: string }[]; id?: string } | null;
  onClose: () => void;
  onPicked: (r: LyricsResult) => void;
}) {
  const [query, setQuery] = useState(
    track ? `${track.name} ${track.artists.map((a) => a.name).join(" ")}` : ""
  );
  const [results, setResults] = useState<LyricsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const { results } = await lyricsApi.search(query);
      setResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-edge p-3">
        <Search size={15} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search lyrics..."
          autoFocus
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
        <button onClick={search} className="rounded bg-accent px-2.5 py-1 text-xs text-accent-fg">
          Search
        </button>
        <button onClick={onClose} className="text-ink-muted hover:text-ink">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-ink-muted" />
          </div>
        ) : results.length === 0 ? (
          <p className="p-4 text-center text-sm text-ink-muted">
            {searched ? "No results found" : "Press Search to find lyrics"}
          </p>
        ) : (
          results.map((r, i) => (
            <button
              key={i}
              onClick={() => onPicked(r)}
              className="block w-full rounded-lg p-2.5 text-left hover:bg-surface-2"
            >
              <p className="text-sm font-medium text-ink">{r.trackName}</p>
              <p className="text-xs text-ink-muted">{r.artistName} · {r.albumName}</p>
              <p className="mt-0.5 text-[10px] text-ink-muted/70">
                {r.syncedLyrics ? "Synced" : "Plain"} · {r.instrumental ? "Instrumental" : `${r.duration}s`}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

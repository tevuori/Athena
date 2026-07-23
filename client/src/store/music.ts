import { create } from "zustand";
import type { SpotifyPlayerState, SpotifyTrack } from "../services/spotify";
import { spotifyApi } from "../services/spotify";
import { lyricsApi, parseLrc, type LyricsLine } from "../services/lyrics";

type ConnectionState = "idle" | "connecting" | "ready" | "error" | "not-configured";

interface MusicState {
  connection: ConnectionState;
  error: string | null;
  state: SpotifyPlayerState | null;
  positionMs: number;
  /** Client-side Date.now() when positionMs was last updated from the server. */
  positionUpdatedAt: number;
  lyrics: LyricsLine[];
  lyricsLoading: boolean;
  lyricsError: string | null;
  lyricsTrackId: string | null;
  expanded: boolean;
  chilling: boolean;

  init: () => Promise<void>;
  refreshState: () => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  fetchLyrics: (track: SpotifyTrack) => Promise<void>;
  setPosition: (ms: number) => void;
  setExpanded: (b: boolean) => void;
  setChilling: (b: boolean) => void;
}

// Module-level poll ID — ensures only one interval ever runs
let pollId: number | undefined;
const POLL_INTERVAL = 5000; // 5 seconds

function clearPoll() {
  if (pollId !== undefined) {
    clearInterval(pollId);
    pollId = undefined;
  }
}

function startPoll(refresh: () => Promise<void>) {
  clearPoll();
  pollId = window.setInterval(() => {
    // Skip polling if paused — no state changes to observe.
    // The store will be refreshed manually after control actions.
    const s = useMusic.getState().state;
    if (s?.is_playing) {
      refresh();
    }
  }, POLL_INTERVAL);
}

export const useMusic = create<MusicState>((set, get) => ({
  connection: "idle",
  error: null,
  state: null,
  positionMs: 0,
  positionUpdatedAt: 0,
  lyrics: [],
  lyricsLoading: false,
  lyricsError: null,
  lyricsTrackId: null,
  expanded: false,
  chilling: false,

  init: async () => {
    if (get().connection === "connecting" || get().connection === "ready") return;
    set({ connection: "connecting", error: null });

    try {
      const { configured } = await spotifyApi.status();
      if (!configured) {
        set({ connection: "not-configured", error: "Spotify not configured on server" });
        return;
      }

      await get().refreshState();
      set({ connection: "ready" });
      startPoll(get().refreshState);
    } catch (e) {
      set({ connection: "error", error: (e as Error).message });
    }
  },

  refreshState: async () => {
    try {
      const state = await spotifyApi.player();
      if (!state || !state.item) {
        set({ state: null });
        return;
      }
      const prev = get().state;
      const trackChanged = prev?.item?.id !== state.item?.id;
      set({ state, positionMs: state.progress_ms ?? 0, positionUpdatedAt: Date.now() });

      if (trackChanged && state.item) {
        get().fetchLyrics(state.item);
      }
    } catch {
      // 204 = no playback, ignore
    }
  },

  togglePlay: async () => {
    const s = get().state;
    if (s?.is_playing) await spotifyApi.pause();
    else await spotifyApi.play();
    setTimeout(() => get().refreshState(), 300);
  },

  next: async () => {
    await spotifyApi.next();
    setTimeout(() => get().refreshState(), 400);
  },

  previous: async () => {
    await spotifyApi.previous();
    setTimeout(() => get().refreshState(), 400);
  },

  seek: async (ms) => {
    await spotifyApi.seek(ms);
    set({ positionMs: ms, positionUpdatedAt: Date.now() });
  },

  fetchLyrics: async (track) => {
    if (!track.id) return;
    set({ lyricsLoading: true, lyricsError: null, lyricsTrackId: track.id, lyrics: [] });
    try {
      const res = await lyricsApi.get({
        track_name: track.name,
        artist_name: track.artists.map((a) => a.name).join(", "),
        album_name: track.album.name,
        duration: Math.round(track.duration_ms / 1000),
        track_id: track.id,
      });
      if (res.result && res.result.syncedLyrics) {
        set({ lyrics: parseLrc(res.result.syncedLyrics), lyricsLoading: false });
      } else if (res.result && res.result.instrumental) {
        set({ lyrics: [], lyricsLoading: false, lyricsError: "Instrumental track" });
      } else {
        set({ lyrics: [], lyricsLoading: false, lyricsError: "No lyrics found" });
      }
    } catch {
      set({ lyrics: [], lyricsLoading: false, lyricsError: "No lyrics found" });
    }
  },

  setPosition: (ms) => set({ positionMs: ms, positionUpdatedAt: Date.now() }),
  setExpanded: (expanded) => set({ expanded }),
  setChilling: (chilling) => set({ chilling }),
}));

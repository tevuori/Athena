import { create } from "zustand";
import type { SpotifyPlayer, SpotifyPlayerState, SpotifyTrack, WebPlaybackState } from "../services/spotify";
import { spotifyApi, loadSpotifySDK } from "../services/spotify";
import { lyricsApi, parseLrc, type LyricsLine } from "../services/lyrics";

type ConnectionState = "idle" | "connecting" | "ready" | "error" | "not-configured";

interface MusicState {
  connection: ConnectionState;
  error: string | null;
  player: SpotifyPlayer | null;
  deviceId: string | null;
  state: SpotifyPlayerState | null;
  positionMs: number;
  lyrics: LyricsLine[];
  lyricsLoading: boolean;
  lyricsError: string | null;
  lyricsTrackId: string | null;
  showMiniPlayer: boolean;

  init: () => Promise<void>;
  refreshState: () => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVolume: (percent: number) => Promise<void>;
  fetchLyrics: (track: SpotifyTrack) => Promise<void>;
  setShowMiniPlayer: (b: boolean) => void;
  setPosition: (ms: number) => void;
}

export const useMusic = create<MusicState>((set, get) => ({
  connection: "idle",
  error: null,
  player: null,
  deviceId: null,
  state: null,
  positionMs: 0,
  lyrics: [],
  lyricsLoading: false,
  lyricsError: null,
  lyricsTrackId: null,
  showMiniPlayer: false,

  init: async () => {
    if (get().connection === "connecting" || get().connection === "ready") return;
    set({ connection: "connecting", error: null });

    try {
      // Check if Spotify is configured on the server
      const { configured } = await spotifyApi.status();
      if (!configured) {
        set({ connection: "not-configured", error: "Spotify not configured on server" });
        return;
      }

      // Note: we intentionally do NOT pre-check for Premium here.
      // The /me endpoint only returns `product` with the `user-read-private`
      // scope, which the stored refresh token may not have. Instead we let
      // the Web Playback SDK connect and rely on its `initialization_error` /
      // `account_error` events to report genuine non-Premium failures.

      // Load SDK + get token
      const Spotify = await loadSpotifySDK();

      const player: SpotifyPlayer = new Spotify({
        name: "Athena Student OS",
        // The SDK calls this whenever it needs a token (including refreshes).
        // We fetch a fresh one from our server each time, which handles the
        // refresh-token exchange server-side.
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const { access_token } = await spotifyApi.token();
            cb(access_token);
          } catch (e) {
            set({ connection: "error", error: `Token fetch failed: ${(e as Error).message}` });
          }
        },
        volume: 0.7,
      });

      player.addListener("ready", (data: unknown) => {
        const deviceId = (data as { device_id: string }).device_id;
        set({ connection: "ready", deviceId, player });
        // Transfer playback to this device
        spotifyApi.transfer([deviceId], true).catch(() => {});
        get().refreshState();
      });

      player.addListener("not_ready", () => {
        set({ connection: "error", error: "Player disconnected" });
      });

      player.addListener("initialization_error", (e: unknown) => {
        const msg = String(e);
        // The SDK fires this for non-Premium accounts too
        if (/premium/i.test(msg)) {
          set({ connection: "error", error: "Spotify Premium is required for playback" });
        } else {
          set({ connection: "error", error: `Could not initialize player: ${msg}` });
        }
      });

      player.addListener("authentication_error", (e: unknown) => {
        set({ connection: "error", error: `Spotify authentication failed: ${String(e)}` });
      });

      player.addListener("account_error", (e: unknown) => {
        const msg = String(e);
        if (/premium/i.test(msg)) {
          set({ connection: "error", error: "Spotify Premium is required for playback" });
        } else {
          set({ connection: "error", error: `Spotify account error: ${msg}` });
        }
      });

      player.addListener("player_state_changed", (s: unknown) => {
        const state = s as WebPlaybackState | null;
        if (!state) {
          set({ state: null });
          return;
        }
        const track = state.track_window.current_track;
        const repeatState = state.repeat_mode === 0 ? "off" : state.repeat_mode === 1 ? "track" : "context";
        set({
          positionMs: state.position,
          state: {
            device: null,
            is_playing: !state.paused,
            item: {
              id: track.id,
              name: track.name,
              uri: track.uri,
              duration_ms: state.duration,
              artists: track.artists.map((a: { uri: string; name: string }) => ({ id: "", name: a.name, uri: a.uri })),
              album: {
                id: "",
                name: track.album.name,
                uri: track.album.uri,
                images: track.album.images,
              },
            },
            progress_ms: state.position,
            repeat_state: repeatState,
            repeat_mode: state.repeat_mode,
            shuffle_state: state.shuffle,
            timestamp: Date.now(),
          } as SpotifyPlayerState,
        });

        // Fetch lyrics on track change
        if (track.id && track.id !== get().lyricsTrackId) {
          get().fetchLyrics({
            id: track.id,
            name: track.name,
            uri: track.uri,
            duration_ms: state.duration,
            artists: track.artists.map((a: { uri: string; name: string }) => ({ id: "", name: a.name, uri: a.uri })),
            album: {
              id: "",
              name: track.album.name,
              uri: track.album.uri,
              images: track.album.images,
            },
          });
        }
      });

      await player.connect();
    } catch (e) {
      set({ connection: "error", error: (e as Error).message });
    }
  },

  refreshState: async () => {
    try {
      const state = await spotifyApi.player();
      set({ state, positionMs: state.progress_ms ?? 0 });
      if (state.item && state.item.id !== get().lyricsTrackId) {
        get().fetchLyrics(state.item);
      }
    } catch {
      // 204 = no playback, ignore
    }
  },

  togglePlay: async () => {
    const player = get().player;
    if (player) {
      await player.togglePlay();
    } else {
      const s = get().state;
      if (s?.is_playing) await spotifyApi.pause();
      else await spotifyApi.play();
    }
    setTimeout(() => get().refreshState(), 300);
  },

  next: async () => {
    const player = get().player;
    if (player) await player.nextTrack();
    else await spotifyApi.next();
    setTimeout(() => get().refreshState(), 400);
  },

  previous: async () => {
    const player = get().player;
    if (player) await player.previousTrack();
    else await spotifyApi.previous();
    setTimeout(() => get().refreshState(), 400);
  },

  seek: async (ms) => {
    const player = get().player;
    if (player) await player.seek(ms);
    else await spotifyApi.seek(ms);
    set({ positionMs: ms });
  },

  setVolume: async (percent) => {
    const player = get().player;
    if (player) await player.setVolume(percent / 100);
    else await spotifyApi.volume(percent);
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
    } catch (e) {
      set({ lyrics: [], lyricsLoading: false, lyricsError: "No lyrics found" });
    }
  },

  setShowMiniPlayer: (b) => set({ showMiniPlayer: b }),
  setPosition: (ms) => set({ positionMs: ms }),
}));

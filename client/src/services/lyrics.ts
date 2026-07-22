import { api } from "./api";
import type { LyricsLine, LyricsResult } from "../types";

export type { LyricsLine } from "../types";

export interface LyricsResponse {
  cached: boolean;
  result: LyricsResult | null;
  error?: string;
}

export const lyricsApi = {
  /** Exact match by metadata (server caches by trackId). */
  get: (params: {
    track_name: string;
    artist_name: string;
    album_name?: string;
    duration?: number;
    track_id?: string;
  }) => {
    const qs = new URLSearchParams();
    qs.set("track_name", params.track_name);
    qs.set("artist_name", params.artist_name);
    if (params.album_name) qs.set("album_name", params.album_name);
    if (params.duration) qs.set("duration", String(params.duration));
    if (params.track_id) qs.set("track_id", params.track_id);
    return api.get<LyricsResponse>(`/api/lyrics/get?${qs.toString()}`);
  },

  /** Fuzzy search for manual selection. */
  search: (q: string) =>
    api.get<{ results: LyricsResult[] }>(`/api/lyrics/search?q=${encodeURIComponent(q)}`),

  /** Cache a chosen search result under a trackId. */
  cache: (trackId: string, result: LyricsResult) =>
    api.post<{ record: unknown }>(`/api/lyrics/cache/${trackId}`, result),
};

/** Parse LRC `[mm:ss.xx]text` into timed lines. */
export function parseLrc(lrc: string): LyricsLine[] {
  if (!lrc) return [];
  const lines: LyricsLine[] = [];
  const lineRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    lineRe.lastIndex = 0;
    const matches = [...raw.matchAll(lineRe)];
    if (matches.length === 0) continue;
    const text = raw.replace(lineRe, "").trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] ?? "0";
      const frac = parseInt(fracStr, 10) / Math.pow(10, fracStr.length);
      lines.push({ time: min * 60 + sec + frac, text });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** Find the index of the lyric line active at `positionSec`. */
export function findActiveLine(lines: LyricsLine[], positionSec: number): number {
  if (lines.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= positionSec) idx = i;
    else break;
  }
  return idx;
}

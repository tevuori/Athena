/**
 * LRCLIB service — fetches synced lyrics from https://lrclib.net/api
 *
 * Per LRCLIB API guidelines:
 *  - Set a descriptive User-Agent identifying app name + version.
 *  - Throttle requests (we use ~300ms) to respect rate limits.
 *  - Handle 404s and instrumental tracks gracefully.
 *
 * Endpoints used:
 *  GET /api/get    ?track_name=&artist_name=&album_name=&duration=
 *  GET /api/search ?q=<track+artist>
 */

const LRCLIB_BASE = "https://lrclib.net/api";
const APP_VERSION = "0.1.0";
const USER_AGENT = `Athena/${APP_VERSION} (Student OS; +https://github.com/athena/student-os)`;

export interface LrcLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string; // raw LRC
  plainLyrics: string;
  instrumental: boolean;
  id?: number;
}

// Simple throttle: ensure at least `THROTTLE_MS` between requests.
const THROTTLE_MS = 300;
let lastRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = THROTTLE_MS - (now - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function lrclibFetch(path: string): Promise<Response> {
  await throttle();
  const url = path.startsWith("http") ? path : `${LRCLIB_BASE}${path}`;
  return fetch(url, { headers: { "User-Agent": USER_AGENT } });
}

/** Parse LRC `[mm:ss.xx]text` into a sorted array of {time, text}. */
export function parseLrc(lrc: string): LrcLine[] {
  if (!lrc) return [];
  const lines: LrcLine[] = [];
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
      const time = min * 60 + sec + frac;
      lines.push({ time, text });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

interface LrclibResponse {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

function normalize(r: LrclibResponse): LyricsResult {
  return {
    trackName: r.trackName ?? "",
    artistName: r.artistName ?? "",
    albumName: r.albumName ?? "",
    duration: r.duration ?? 0,
    syncedLyrics: r.syncedLyrics ?? "",
    plainLyrics: r.plainLyrics ?? "",
    instrumental: r.instrumental ?? false,
    id: r.id,
  };
}

/** GET /get — exact match by metadata. */
export async function getLyrics(params: {
  track_name: string;
  artist_name: string;
  album_name?: string;
  duration?: number;
}): Promise<LyricsResult | null> {
  const qs = new URLSearchParams({
    track_name: params.track_name,
    artist_name: params.artist_name,
  });
  if (params.album_name) qs.set("album_name", params.album_name);
  if (typeof params.duration === "number") qs.set("duration", String(params.duration));
  const res = await lrclibFetch(`/get?${qs.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB /get returned ${res.status}`);
  const data = (await res.json()) as LrclibResponse;
  return normalize(data);
}

/** GET /search?q= — fuzzy search. Returns multiple results. */
export async function searchLyrics(query: string): Promise<LyricsResult[]> {
  const qs = new URLSearchParams({ q: query });
  const res = await lrclibFetch(`/search?${qs.toString()}`);
  if (!res.ok) throw new Error(`LRCLIB /search returned ${res.status}`);
  const data = (await res.json()) as LrclibResponse[];
  return data.map(normalize);
}

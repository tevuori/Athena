/**
 * Spotify service — server-side token management + Web API proxy.
 *
 * The server holds the long-lived refresh token (from env) and exchanges it for
 * short-lived access tokens. The access token is returned to the client so it
 * can instantiate the Spotify Web Playback SDK. Control endpoints (play/pause/
 * skip/seek/volume) are proxied through the server using the access token, so
 * the client never handles token refresh logic.
 *
 * Token endpoint: https://accounts.spotify.com/api/token
 * Web API base:   https://api.spotify.com/v1
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? "";
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN ?? "";

export interface SpotifyTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface SpotifyApiError {
  status: number;
  message: string;
}

let cachedToken: SpotifyTokens | null = null;
let cachedAt = 0;

/** Refresh the access token using the stored refresh token. */
export async function refreshAccessToken(): Promise<SpotifyTokens> {
  if (!REFRESH_TOKEN) {
    throw { status: 500, message: "Spotify not configured: missing SPOTIFY_REFRESH_TOKEN" } as SpotifyApiError;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `Spotify token refresh failed: ${text}` } as SpotifyApiError;
  }
  const data = (await res.json()) as SpotifyTokens & { refresh_token?: string };
  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    scope: data.scope,
  };
  cachedAt = Date.now();
  return cachedToken;
}

/** Get a valid access token, refreshing if the cached one is near expiry. */
export async function getAccessToken(): Promise<string> {
  const margin = 60_000; // refresh 1 min before expiry
  if (cachedToken && Date.now() - cachedAt < cachedToken.expires_in * 1000 - margin) {
    return cachedToken.access_token;
  }
  const tokens = await refreshAccessToken();
  return tokens.access_token;
}

export function isSpotifyConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

/** Proxy a Spotify Web API call. */
export async function spotifyFetch(
  path: string,
  init: RequestInit = {},
  method?: string
): Promise<Response> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    method: method ?? init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  return res;
}

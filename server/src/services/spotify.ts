/**
 * Spotify service — per-user token management + Web API proxy.
 *
 * Each user stores their own Spotify credentials (client id, secret, refresh
 * token) encrypted in the DB. Server-wide SPOTIFY_* env vars serve as an
 * optional fallback (e.g. for the admin who set them up).
 *
 * Token endpoint: https://accounts.spotify.com/api/token
 * Web API base:   https://api.spotify.com/v1
 */

import prisma from "../db/client";
import { encryptSecret, decryptSecret } from "./crypto";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

// Server-wide fallback (env vars)
const ENV_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
const ENV_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? "";
const ENV_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN ?? "";

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

export interface SpotifyUserConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** True if using per-user DB credentials (vs env fallback). */
  perUser: boolean;
}

function decryptSafe(enc: string): string {
  try {
    return decryptSecret(enc);
  } catch {
    return "";
  }
}

/** Load a user's Spotify config: per-user DB → env fallback. */
export async function getUserSpotifyConfig(userId: string): Promise<SpotifyUserConfig | null> {
  const cred = await prisma.spotifyCredential.findUnique({ where: { userId } });
  if (cred) {
    const clientId = decryptSafe(cred.clientIdEnc);
    const clientSecret = decryptSafe(cred.clientSecretEnc);
    const refreshToken = decryptSafe(cred.refreshTokenEnc);
    if (clientId && clientSecret && refreshToken) {
      return { clientId, clientSecret, refreshToken, perUser: true };
    }
  }
  // Fallback to server env vars
  if (ENV_CLIENT_ID && ENV_CLIENT_SECRET && ENV_REFRESH_TOKEN) {
    return {
      clientId: ENV_CLIENT_ID,
      clientSecret: ENV_CLIENT_SECRET,
      refreshToken: ENV_REFRESH_TOKEN,
      perUser: false,
    };
  }
  return null;
}

/** Check if Spotify is configured for a given user (per-user or env fallback). */
export async function isSpotifyConfiguredFor(userId: string): Promise<boolean> {
  const config = await getUserSpotifyConfig(userId);
  return config !== null;
}

// Per-user token cache: userId → { token, expiresAt }
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/** Refresh the access token using the user's stored refresh token. */
async function refreshAccessToken(userId: string, config: SpotifyUserConfig): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
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
  tokenCache.set(userId, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  // If Spotify returned a new refresh token, persist it.
  if (data.refresh_token && data.refresh_token !== config.refreshToken && config.perUser) {
    await prisma.spotifyCredential.update({
      where: { userId },
      data: { refreshTokenEnc: encryptSecret(data.refresh_token) },
    });
  }
  return data;
}

/** Get a valid access token for a user, refreshing if the cached one is near expiry. */
export async function getAccessToken(userId: string): Promise<string> {
  const config = await getUserSpotifyConfig(userId);
  if (!config) {
    throw { status: 500, message: "Spotify not configured for this user" } as SpotifyApiError;
  }
  const margin = 60_000;
  const cached = tokenCache.get(userId);
  if (cached && Date.now() < cached.expiresAt - margin) {
    return cached.accessToken;
  }
  const tokens = await refreshAccessToken(userId, config);
  return tokens.access_token;
}

/** Proxy a Spotify Web API call for a specific user. */
export async function spotifyFetch(
  userId: string,
  path: string,
  init: RequestInit = {},
  method?: string
): Promise<Response> {
  const token = await getAccessToken(userId);
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

/**
 * Microsoft Graph Calendar service — per-user token management + Graph API.
 *
 * Each user stores their own Microsoft OAuth2 credentials (client id, secret,
 * tenant id, refresh token) encrypted in the DB. The refresh token may rotate
 * on each exchange, so the latest is persisted back to the DB. Server-wide
 * MS_* env vars serve as an optional fallback.
 *
 * Token endpoint: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 * Graph API base:  https://graph.microsoft.com/v1.0
 *
 * Required scope: Calendar.ReadWrite (offline_access for refresh tokens).
 */

import prisma from "../db/client";
import { encryptSecret, decryptSecret } from "./crypto";

const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Server-wide fallback (env vars)
const ENV_CLIENT_ID = process.env.MS_CLIENT_ID ?? "";
const ENV_CLIENT_SECRET = process.env.MS_CLIENT_SECRET ?? "";
const ENV_TENANT_ID = process.env.MS_TENANT_ID ?? "common";
const ENV_REFRESH_TOKEN = process.env.MS_REFRESH_TOKEN ?? "";

export interface MsTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export interface MsApiError {
  status: number;
  message: string;
}

export interface MsGraphEvent {
  id: string;
  subject: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  location?: { displayName: string };
  showAs?: string;
}

export interface MsUserConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
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

/** Load a user's Microsoft config: per-user DB → env fallback. */
export async function getUserMsConfig(userId: string): Promise<MsUserConfig | null> {
  const cred = await prisma.microsoftCredential.findUnique({ where: { userId } });
  if (cred) {
    const clientId = decryptSafe(cred.clientIdEnc);
    const clientSecret = decryptSafe(cred.clientSecretEnc);
    const refreshToken = decryptSafe(cred.refreshTokenEnc);
    if (clientId && clientSecret && refreshToken) {
      return {
        clientId,
        clientSecret,
        tenantId: cred.tenantId || "common",
        refreshToken,
        perUser: true,
      };
    }
  }
  // Fallback to server env vars
  if (ENV_CLIENT_ID && ENV_CLIENT_SECRET && ENV_REFRESH_TOKEN) {
    return {
      clientId: ENV_CLIENT_ID,
      clientSecret: ENV_CLIENT_SECRET,
      tenantId: ENV_TENANT_ID,
      refreshToken: ENV_REFRESH_TOKEN,
      perUser: false,
    };
  }
  return null;
}

/** Check if Microsoft Calendar is configured for a given user. */
export async function isMicrosoftConfiguredFor(userId: string): Promise<boolean> {
  const config = await getUserMsConfig(userId);
  return config !== null;
}

// Per-user token cache: userId → { accessToken, expiresAt }
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/** Exchange the refresh token for a fresh access token. Handles rotation. */
async function refreshAccessToken(userId: string, config: MsUserConfig): Promise<MsTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "offline_access Calendars.ReadWrite",
  });
  const res = await fetch(TOKEN_URL(config.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `MS token refresh failed: ${text}` } as MsApiError;
  }
  const data = (await res.json()) as MsTokens;
  tokenCache.set(userId, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  // Persist the rotated refresh token if a new one was returned.
  if (data.refresh_token && data.refresh_token !== config.refreshToken && config.perUser) {
    await prisma.microsoftCredential.update({
      where: { userId },
      data: { refreshTokenEnc: encryptSecret(data.refresh_token) },
    });
  }
  return data;
}

/** Get a valid access token for a user, refreshing if the cached one is near expiry. */
export async function getAccessToken(userId: string): Promise<string> {
  const config = await getUserMsConfig(userId);
  if (!config) {
    throw { status: 500, message: "Microsoft not configured for this user" } as MsApiError;
  }
  const margin = 60_000;
  const cached = tokenCache.get(userId);
  if (cached && Date.now() < cached.expiresAt - margin) {
    return cached.accessToken;
  }
  const tokens = await refreshAccessToken(userId, config);
  return tokens.access_token;
}

// ===== Graph API helpers =====

async function graphFetch(userId: string, path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(userId);
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  return res;
}

/** List events in a time range from the user's default calendar. */
export async function listEvents(
  userId: string,
  startDateTime: string,
  endDateTime: string
): Promise<MsGraphEvent[]> {
  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $select: "id,subject,body,start,end,isAllDay,location,showAs",
    $top: "250",
    $orderby: "start/dateTime",
  });
  const res = await graphFetch(userId, `/me/calendar/calendarView?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `MS listEvents failed: ${text}` } as MsApiError;
  }
  const data = (await res.json()) as { value: MsGraphEvent[] };
  return data.value ?? [];
}

/** Create an event in the user's default calendar. */
export async function createEvent(
  userId: string,
  event: {
    subject: string;
    body?: string;
    start: string; // ISO
    end: string; // ISO
    isAllDay?: boolean;
    location?: string;
  }
): Promise<MsGraphEvent> {
  const body = {
    subject: event.subject,
    body: event.body ? { contentType: "Text", content: event.body } : undefined,
    start: { dateTime: event.start, timeZone: "UTC" },
    end: { dateTime: event.end, timeZone: "UTC" },
    isAllDay: event.isAllDay ?? false,
    location: event.location ? { displayName: event.location } : undefined,
  };
  const res = await graphFetch(userId, "/me/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `MS createEvent failed: ${text}` } as MsApiError;
  }
  return (await res.json()) as MsGraphEvent;
}

/** Update an event in the user's default calendar. */
export async function updateEvent(
  userId: string,
  id: string,
  event: {
    subject?: string;
    body?: string;
    start?: string;
    end?: string;
    isAllDay?: boolean;
    location?: string;
  }
): Promise<MsGraphEvent> {
  const body: Record<string, unknown> = {};
  if (event.subject !== undefined) body.subject = event.subject;
  if (event.body !== undefined) body.body = { contentType: "Text", content: event.body };
  if (event.start !== undefined) body.start = { dateTime: event.start, timeZone: "UTC" };
  if (event.end !== undefined) body.end = { dateTime: event.end, timeZone: "UTC" };
  if (event.isAllDay !== undefined) body.isAllDay = event.isAllDay;
  if (event.location !== undefined) body.location = { displayName: event.location };
  const res = await graphFetch(userId, `/me/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `MS updateEvent failed: ${text}` } as MsApiError;
  }
  return (await res.json()) as MsGraphEvent;
}

/** Delete an event from the user's default calendar. */
export async function deleteEvent(userId: string, id: string): Promise<void> {
  const res = await graphFetch(userId, `/me/events/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw { status: res.status, message: `MS deleteEvent failed: ${text}` } as MsApiError;
  }
}

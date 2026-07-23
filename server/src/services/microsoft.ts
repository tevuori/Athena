/**
 * Microsoft Graph Calendar service — server-side token management + Graph API.
 *
 * The server holds the OAuth2 credentials (from env) and a long-lived refresh
 * token. Microsoft may rotate the refresh token on each exchange, so the latest
 * token is persisted in the Setting table (key="ms_refresh_token", userId=null)
 * to survive restarts. On first run, the env var MS_REFRESH_TOKEN seeds the DB.
 *
 * Token endpoint: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 * Graph API base:  https://graph.microsoft.com/v1.0
 *
 * Required scope: Calendar.ReadWrite (offline_access for refresh tokens).
 */

import prisma from "../db/client";

const TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const CLIENT_ID = process.env.MS_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET ?? "";
const TENANT_ID = process.env.MS_TENANT_ID ?? "common";
const ENV_REFRESH_TOKEN = process.env.MS_REFRESH_TOKEN ?? "";

const SETTING_KEY = "ms_refresh_token";

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

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export function isMicrosoftConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && ENV_REFRESH_TOKEN);
}

/** Read the current refresh token from the DB, falling back to the env var. */
async function getStoredRefreshToken(): Promise<string> {
  const setting = await prisma.setting.findFirst({
    where: { key: SETTING_KEY, userId: null },
  });
  return setting?.value || ENV_REFRESH_TOKEN;
}

/** Persist a (possibly rotated) refresh token to the DB. */
async function storeRefreshToken(token: string): Promise<void> {
  const existing = await prisma.setting.findFirst({
    where: { key: SETTING_KEY, userId: null },
  });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value: token } });
  } else {
    await prisma.setting.create({ data: { key: SETTING_KEY, value: token } });
  }
}

/** Exchange the refresh token for a fresh access token. Handles rotation. */
export async function refreshAccessToken(): Promise<MsTokens> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    throw { status: 500, message: "Microsoft not configured: missing MS_REFRESH_TOKEN" } as MsApiError;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "offline_access Calendars.ReadWrite",
  });
  const res = await fetch(TOKEN_URL(TENANT_ID), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `MS token refresh failed: ${text}` } as MsApiError;
  }
  const data = (await res.json()) as MsTokens;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  // Persist the rotated refresh token if a new one was returned.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await storeRefreshToken(data.refresh_token);
  }
  return data;
}

/** Get a valid access token, refreshing if the cached one is near expiry. */
export async function getAccessToken(): Promise<string> {
  const margin = 60_000;
  if (cachedToken && Date.now() < cachedToken.expiresAt - margin) {
    return cachedToken.accessToken;
  }
  const tokens = await refreshAccessToken();
  return tokens.access_token;
}

// ===== Graph API helpers =====

async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
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
  const res = await graphFetch(`/me/calendar/calendarView?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw { status: res.status, message: `MS listEvents failed: ${text}` } as MsApiError;
  }
  const data = (await res.json()) as { value: MsGraphEvent[] };
  return data.value ?? [];
}

/** Create an event in the user's default calendar. */
export async function createEvent(event: {
  subject: string;
  body?: string;
  start: string; // ISO
  end: string; // ISO
  isAllDay?: boolean;
  location?: string;
}): Promise<MsGraphEvent> {
  const body = {
    subject: event.subject,
    body: event.body ? { contentType: "Text", content: event.body } : undefined,
    start: { dateTime: event.start, timeZone: "UTC" },
    end: { dateTime: event.end, timeZone: "UTC" },
    isAllDay: event.isAllDay ?? false,
    location: event.location ? { displayName: event.location } : undefined,
  };
  const res = await graphFetch("/me/events", {
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
  const res = await graphFetch(`/me/events/${id}`, {
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
export async function deleteEvent(id: string): Promise<void> {
  const res = await graphFetch(`/me/events/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw { status: res.status, message: `MS deleteEvent failed: ${text}` } as MsApiError;
  }
}

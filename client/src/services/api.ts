/**
 * Thin fetch wrapper for the Athena backend.
 * - Reads JWT from localStorage and attaches Authorization header.
 * - On 401, attempts a single refresh-token rotation (using the stored
 *   refresh token + device fingerprint) and retries the original request.
 * - On refresh failure, clears tokens (the auth store will redirect to login).
 * - All paths are relative ("/api/...") and proxied by Vite in dev / nginx in prod.
 */

const TOKEN_KEY = "athena.token";
const REFRESH_KEY = "athena.refresh";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    const { getFingerprint } = await import("./fingerprint");
    const fingerprint = await getFingerprint();
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken, deviceFingerprint: fingerprint }),
      });
      if (!res.ok) {
        setToken(null);
        setRefreshToken(null);
        return false;
      }
      const data = await res.json();
      setToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return true;
    } catch {
      setToken(null);
      setRefreshToken(null);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const token = getToken();
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(path, { ...init, headers });
  };

  let res = await doFetch();

  // On 401, try one refresh + retry (skip for the refresh endpoint itself to avoid loops).
  if (res.status === 401 && !path.startsWith("/api/auth/refresh")) {
    const ok = await doRefresh();
    if (ok) {
      res = await doFetch();
    } else {
      setToken(null);
      setRefreshToken(null);
    }
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      setRefreshToken(null);
    }
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  /** Raw fetch for binary downloads (returns Response). Does NOT auto-refresh. */
  raw: (path: string, init: RequestInit = {}) => {
    const token = getToken();
    const headers = { ...(init.headers as Record<string, string>) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(path, { ...init, headers });
  },
};

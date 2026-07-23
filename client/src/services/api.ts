/**
 * Thin fetch wrapper for the Athena backend.
 * - Reads JWT from localStorage and attaches Authorization header.
 * - On 401, clears the token (the auth store will redirect to login).
 * - All paths are relative ("/api/...") and proxied by Vite in dev.
 */

const TOKEN_KEY = "athena.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
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

  /** Raw fetch for binary downloads (returns Response). */
  raw: (path: string, init: RequestInit = {}) => {
    const token = getToken();
    const headers = { ...(init.headers as Record<string, string>) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(path, { ...init, headers });
  },
};

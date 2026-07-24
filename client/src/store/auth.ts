import { create } from "zustand";
import type { User } from "../types";
import { api, getToken, setToken, getRefreshToken, setRefreshToken } from "../services/api";
import { getFingerprint } from "../services/fingerprint";

interface AuthState {
  user: User | null;
  token: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: { displayName?: string; avatarColor?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: getToken(),
  status: "loading",

  login: async (username, password, rememberMe = true) => {
    const fingerprint = rememberMe ? await getFingerprint() : "";
    const data = await api.post<{ token: string; refreshToken: string | null; user: User }>(
      "/api/auth/login",
      { username, password, rememberMe, deviceFingerprint: fingerprint }
    );
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    set({ token: data.token, user: data.user, status: "authenticated" });
  },

  register: async (username, password, displayName) => {
    // Bootstrap-only endpoint (first admin). After that it 403s.
    const data = await api.post<{ token: string; refreshToken: string | null; user: User }>(
      "/api/auth/register",
      { username, password, displayName }
    );
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    set({ token: data.token, user: data.user, status: "authenticated" });
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await api.post("/api/auth/logout", { refreshToken });
      } catch {
        /* ignore — clear locally regardless */
      }
    }
    setToken(null);
    setRefreshToken(null);
    set({ user: null, token: null, status: "unauthenticated" });
  },

  refresh: async () => {
    const token = getToken();
    if (!token) {
      // No access token, but maybe a refresh token can recover the session.
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const fingerprint = await getFingerprint();
          const data = await api.post<{ token: string; refreshToken: string; user: User }>(
            "/api/auth/refresh",
            { refreshToken, deviceFingerprint: fingerprint }
          );
          setToken(data.token);
          setRefreshToken(data.refreshToken);
          set({ user: data.user, token: data.token, status: "authenticated" });
          return;
        } catch {
          /* fall through to unauthenticated */
        }
      }
      set({ status: "unauthenticated", user: null, token: null });
      return;
    }
    try {
      const user = await api.get<User>("/api/auth/me");
      set({ user, token, status: "authenticated" });
    } catch {
      // 401 auto-refresh in api.ts already tried; if we're here it failed.
      setToken(null);
      setRefreshToken(null);
      set({ status: "unauthenticated", user: null, token: null });
    }
  },

  updateProfile: async (patch) => {
    const user = await api.patch<User>("/api/auth/profile", patch);
    set({ user: { ...get().user, ...user } });
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.post("/api/auth/password", { currentPassword, newPassword });
    // Password change revokes all refresh tokens server-side; clear locally.
    setRefreshToken(null);
  },

  deleteAccount: async (password) => {
    await api.delete("/api/auth/account", { password });
    setToken(null);
    setRefreshToken(null);
    set({ user: null, token: null, status: "unauthenticated" });
  },
}));

import { create } from "zustand";
import type { User } from "../types";
import { api, getToken, setToken } from "../services/api";

interface AuthState {
  user: User | null;
  token: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  status: "loading",

  login: async (username, password) => {
    const data = await api.post<{ token: string; user: User }>("/api/auth/login", {
      username,
      password,
    });
    setToken(data.token);
    set({ token: data.token, user: data.user, status: "authenticated" });
  },

  register: async (username, password, displayName) => {
    const data = await api.post<{ token: string; user: User }>("/api/auth/register", {
      username,
      password,
      displayName,
    });
    setToken(data.token);
    set({ token: data.token, user: data.user, status: "authenticated" });
  },

  logout: () => {
    setToken(null);
    set({ user: null, token: null, status: "unauthenticated" });
  },

  refresh: async () => {
    const token = getToken();
    if (!token) {
      set({ status: "unauthenticated", user: null, token: null });
      return;
    }
    try {
      const user = await api.get<User>("/api/auth/me");
      set({ user, token, status: "authenticated" });
    } catch {
      setToken(null);
      set({ status: "unauthenticated", user: null, token: null });
    }
  },
}));

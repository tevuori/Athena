import { create } from "zustand";

// ===== Browser state shared between the Browser app and Athena =====
// Tracks the current URL of each open browser window (so Athena's chat context
// can report what the user is viewing) and a per-window command channel so
// Athena's client_action dispatch can drive navigation (navigate/back/
// forward/reload) in the BrowserApp that owns the iframe + history stack.

export type NavKind = "navigate" | "back" | "forward" | "reload";

export interface NavRequest {
  seq: number;
  kind: NavKind;
  url?: string;
}

interface BrowserState {
  /** Current displayed URL per browser window id. */
  urls: Record<string, string>;
  /** Pending navigation command per browser window id (consumed by BrowserApp). */
  navRequests: Record<string, NavRequest>;
  /** Update the current URL for a window (called by BrowserApp after navigation). */
  setUrl: (windowId: string, url: string) => void;
  /** Remove all state for a window (on close). */
  removeWindow: (windowId: string) => void;
  /** Request a navigation command for a window (called by Athena dispatch). */
  requestNav: (windowId: string, kind: NavKind, url?: string) => void;
}

let seqCounter = 0;

export const useBrowser = create<BrowserState>((set) => ({
  urls: {},
  navRequests: {},
  setUrl: (windowId, url) =>
    set((s) => ({ urls: { ...s.urls, [windowId]: url } })),
  removeWindow: (windowId) =>
    set((s) => {
      const urls = { ...s.urls };
      const navRequests = { ...s.navRequests };
      delete urls[windowId];
      delete navRequests[windowId];
      return { urls, navRequests };
    }),
  requestNav: (windowId, kind, url) =>
    set((s) => ({
      navRequests: {
        ...s.navRequests,
        [windowId]: { seq: ++seqCounter, kind, url },
      },
    })),
}));

import { create } from "zustand";

// ===== Browser state shared between the Browser app and Athena =====
// Tracks the current URL of each open browser window (so Athena's chat context
// can report what the user is viewing) and a per-window command channel so
// Athena's client_action dispatch can drive navigation (navigate/back/
// forward/reload) AND DOM automation (click/fill/submit/highlight/scroll) in
// the BrowserApp that owns the iframe + history stack.

export type NavKind = "navigate" | "back" | "forward" | "reload";

export interface NavRequest {
  seq: number;
  kind: NavKind;
  url?: string;
  /** Optional tab id to target a specific tab within the window. */
  tabId?: string;
}

/** DOM automation command — executed by BrowserApp on the active tab's iframe
 *  document (same-origin, so direct DOM access works). */
export type BrowserCmdKind =
  | "click"
  | "fill"
  | "submit"
  | "highlight"
  | "clear_highlight"
  | "scroll"
  | "new_tab"
  | "close_tab";

export interface BrowserCommand {
  seq: number;
  kind: BrowserCmdKind;
  /** CSS selector for the target element (click/fill/submit/scroll/highlight). */
  selector?: string;
  /** Visible text to find an element by (click/scroll/highlight). */
  text?: string;
  /** Value to fill into a field (fill only). */
  value?: string;
  /** Scroll direction (scroll only: "up" | "down" | "top" | "bottom"). */
  direction?: string;
  /** Tab id to target (optional — defaults to the active tab). */
  tabId?: string;
  /** URL for new_tab commands. */
  url?: string;
}

interface BrowserState {
  /** Current displayed URL per browser window id (the active tab's URL). */
  urls: Record<string, string>;
  /** Pending navigation command per browser window id (consumed by BrowserApp). */
  navRequests: Record<string, NavRequest>;
  /** Pending DOM automation command per browser window id. */
  commands: Record<string, BrowserCommand>;
  /** Tab list per window id (reported by BrowserApp for Athena's list_tabs). */
  tabs: Record<string, { id: string; url: string; title: string }[]>;
  /** Update the current URL for a window (called by BrowserApp after navigation). */
  setUrl: (windowId: string, url: string) => void;
  /** Report the current tab list for a window (called by BrowserApp). */
  setTabs: (windowId: string, tabs: { id: string; url: string; title: string }[]) => void;
  /** Remove all state for a window (on close). */
  removeWindow: (windowId: string) => void;
  /** Request a navigation command for a window (called by Athena dispatch). */
  requestNav: (windowId: string, kind: NavKind, url?: string, tabId?: string) => void;
  /** Issue a DOM automation command for a window (called by Athena dispatch). */
  issueCommand: (windowId: string, kind: BrowserCmdKind, payload?: Partial<Omit<BrowserCommand, "seq" | "kind">>) => void;
}

let seqCounter = 0;
let cmdCounter = 0;

export const useBrowser = create<BrowserState>((set) => ({
  urls: {},
  navRequests: {},
  commands: {},
  tabs: {},
  setUrl: (windowId, url) =>
    set((s) => ({ urls: { ...s.urls, [windowId]: url } })),
  setTabs: (windowId, tabs) =>
    set((s) => ({ tabs: { ...s.tabs, [windowId]: tabs } })),
  removeWindow: (windowId) =>
    set((s) => {
      const urls = { ...s.urls };
      const navRequests = { ...s.navRequests };
      const commands = { ...s.commands };
      const tabs = { ...s.tabs };
      delete urls[windowId];
      delete navRequests[windowId];
      delete commands[windowId];
      delete tabs[windowId];
      return { urls, navRequests, commands, tabs };
    }),
  requestNav: (windowId, kind, url, tabId) =>
    set((s) => ({
      navRequests: {
        ...s.navRequests,
        [windowId]: { seq: ++seqCounter, kind, url, tabId },
      },
    })),
  issueCommand: (windowId, kind, payload = {}) =>
    set((s) => ({
      commands: {
        ...s.commands,
        [windowId]: { seq: ++cmdCounter, kind, ...payload },
      },
    })),
}));

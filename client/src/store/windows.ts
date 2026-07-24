import { create } from "zustand";
import { useFormFactor } from "./formfactor";

export type AppId =
  | "notes"
  | "tasks"
  | "files"
  | "settings"
  | "terminal"
  | "pomodoro"
  | "flashcards"
  | "grades"
  | "vut"
  | "editor"
  | "viewer"
  | "athena"
  | "study"
  | "today"
  | "calendar"
  | "habits"
  | "whiteboard"
  | "ntfy"
  | "voice"
  | "browser";

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SnapZone =
  | "none"
  | "left"
  | "right"
  | "maximized"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface WindowInstance {
  id: string; // unique instance id (allows multiple windows of same app)
  appId: AppId;
  title: string;
  icon: string; // lucide icon name
  rect: WindowRect;
  prevRect?: WindowRect; // saved before maximize/snap
  snap: SnapZone;
  zIndex: number;
  minimized: boolean;
  closing: boolean; // true while exit animation plays before removal
  alwaysOnTop?: boolean; // window stays above all others (e.g. Athena)
  /** When true, position/size changes animate via CSS transition (auto-tiling). */
  tiling?: boolean;
  // Optional payload passed to the app (e.g. noteId to open)
  payload?: Record<string, unknown>;
}

interface WindowsState {
  windows: WindowInstance[];
  focusedId: string | null;
  zCounter: number;

  open: (input: {
    appId: AppId;
    title: string;
    icon: string;
    payload?: Record<string, unknown>;
    rect?: Partial<WindowRect>;
  }) => string;
  /** Marks window as closing (triggers exit animation), then removes after a delay. */
  close: (id: string) => void;
  /** Immediately removes a window from state (called after animation). */
  removeWindow: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  snap: (id: string, zone: SnapZone) => void;
  setRect: (id: string, rect: WindowRect) => void;
  setTitle: (id: string, title: string) => void;
  restoreOrMinimize: (id: string) => void; // taskbar click behavior
  cycleFocus: (direction: 1 | -1) => void; // Alt+Tab
  closeAll: () => void;
  /** Re-tile all visible windows into a grid. Called automatically on open/close. */
  retile: () => void;

  // ===== Mobile navigation (phone form factor) =====
  // On mobile there are no floating windows; instead a stack of apps where
  // only the top (active) one is rendered full-bleed. The desktop `open`/
  // `close`/`focus` calls are mirrored into mobile methods so all existing
  // app call-sites work unchanged regardless of form factor.
  /** Ordered stack of mobile app entries (bottom = first opened, top = active). */
  mobileStack: MobileAppEntry[];
  /** The active (top-of-stack) mobile app id, or null when on the Today home. */
  mobileActiveId: string | null;
  /** Whether the mobile home (Today) is currently showing. */
  mobileOnHome: boolean;
  /** Open (push) an app onto the mobile stack. Returns the entry id. */
  mobileOpen: (input: {
    appId: AppId;
    title: string;
    icon: string;
    payload?: Record<string, unknown>;
  }) => string;
  /** Close (pop) a mobile app by entry id. */
  mobileClose: (id: string) => void;
  /** Go back one level (pop active), or to home if only one entry remains. */
  mobileBack: () => void;
  /** Return to the Today home (clears the active app but keeps stack for recents). */
  mobileGoHome: () => void;
  /** Activate a specific mobile entry by id (bring to top). */
  mobileActivate: (id: string) => void;
  /** Replace the entire mobile stack with a single app (used by bottom nav). */
  mobileSwitchTo: (input: {
    appId: AppId;
    title: string;
    icon: string;
    payload?: Record<string, unknown>;
  }) => string;
}

export interface MobileAppEntry {
  id: string;
  appId: AppId;
  title: string;
  icon: string;
  payload?: Record<string, unknown>;
}

let idCounter = 0;
const nextId = () => `win-${++idCounter}`;

const DEFAULT_SIZE: Record<AppId, WindowRect> = {
  notes: { x: 120, y: 80, width: 880, height: 600 },
  tasks: { x: 180, y: 100, width: 920, height: 560 },
  files: { x: 100, y: 60, width: 820, height: 560 },
  settings: { x: 260, y: 140, width: 720, height: 540 },
  terminal: { x: 200, y: 160, width: 700, height: 440 },
  pomodoro: { x: 300, y: 100, width: 420, height: 560 },
  flashcards: { x: 160, y: 80, width: 880, height: 600 },
  grades: { x: 140, y: 70, width: 920, height: 620 },
  vut: { x: 120, y: 60, width: 960, height: 660 },
  editor: { x: 160, y: 70, width: 920, height: 640 },
  viewer: { x: 200, y: 90, width: 820, height: 620 },
  athena: { x: 200, y: 90, width: 760, height: 620 },
  study: { x: 140, y: 60, width: 960, height: 660 },
  today: { x: 160, y: 70, width: 880, height: 640 },
  calendar: { x: 120, y: 60, width: 1000, height: 680 },
  habits: { x: 200, y: 100, width: 820, height: 600 },
  whiteboard: { x: 120, y: 60, width: 1040, height: 700 },
  ntfy: { x: 220, y: 90, width: 760, height: 620 },
  voice: { x: 280, y: 120, width: 480, height: 640 },
  browser: { x: 120, y: 60, width: 1000, height: 680 },
};

function clampToViewport(rect: WindowRect): WindowRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight - 48; // taskbar height
  const width = Math.min(rect.width, vw - 20);
  const height = Math.min(rect.height, vh - 20);
  const x = Math.max(0, Math.min(rect.x, vw - width - 4));
  const y = Math.max(0, Math.min(rect.y, vh - height - 4));
  return { x, y, width, height };
}

const TASKBAR_H = 48;

/** True when a rect covers (nearly) the entire usable viewport. */
function isFullscreenRect(rect: WindowRect): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight - TASKBAR_H;
  return rect.width >= vw - 4 && rect.height >= vh - 4;
}

/**
 * Compute a sensible "restored" rect for a window that is currently full-screen.
 * Prefers the saved prevRect (if it's not itself fullscreen), otherwise falls
 * back to the app's default size. The result is centered + clamped.
 */
function computeRestoredRect(win: WindowInstance): WindowRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight - TASKBAR_H;
  const prev = win.prevRect && !isFullscreenRect(win.prevRect) ? win.prevRect : null;
  const base = prev ?? DEFAULT_SIZE[win.appId];
  const width = Math.min(base.width, vw - 20);
  const height = Math.min(base.height, vh - 20);
  const x = Math.max(0, Math.floor((vw - width) / 2));
  const y = Math.max(0, Math.floor((vh - height) / 2));
  return { x, y, width, height };
}

/**
 * Compute a grid layout for the given windows.
 * Returns a map of windowId → rect.
 * Always-on-top, minimized, and closing windows are excluded.
 */
function computeGridLayout(windows: WindowInstance[]): Record<string, WindowRect> {
  const vw = window.innerWidth;
  const vh = window.innerHeight - TASKBAR_H;
  const tileable = windows.filter((w) => !w.alwaysOnTop && !w.minimized && !w.closing);
  if (tileable.length === 0) return {};

  // Single window → full screen
  if (tileable.length === 1) {
    return { [tileable[0].id]: { x: 0, y: 0, width: vw, height: vh } };
  }

  const cols = Math.ceil(Math.sqrt(tileable.length));
  const rows = Math.ceil(tileable.length / cols);
  const cw = Math.floor(vw / cols);
  const ch = Math.floor(vh / rows);
  const result: Record<string, WindowRect> = {};
  tileable.forEach((win, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Last row may have fewer items — stretch them to fill remaining width
    const isLastRow = row === rows - 1;
    const itemsInLastRow = tileable.length - row * cols;
    const width = isLastRow && itemsInLastRow < cols ? Math.floor(vw / itemsInLastRow) : cw;
    const x = isLastRow && itemsInLastRow < cols ? col * width : col * cw;
    result[win.id] = { x, y: row * ch, width, height: ch };
  });
  return result;
}

export const useWindows = create<WindowsState>((set, get) => ({
  windows: [],
  focusedId: null,
  zCounter: 10,

  // Mobile navigation state
  mobileStack: [],
  mobileActiveId: null,
  mobileOnHome: true,

  open: ({ appId, title, icon, payload, rect }) => {
    const state = get();
    // On the phone form factor, route to the mobile app stack instead of
    // creating a floating desktop window. This keeps every existing call
    // site (CommandPalette, Today, Files, Athena tool-calls, etc.) working
    // unchanged across both shells.
    if (useFormFactor.getState().mode === "phone") {
      return get().mobileOpen({ appId, title, icon, payload });
    }
    // If a window for this app+payload already exists, focus it.
    const existing = state.windows.find(
      (w) => w.appId === appId && JSON.stringify(w.payload) === JSON.stringify(payload)
    );
    if (existing) {
      get().focus(existing.id);
      if (existing.minimized) get().minimize(existing.id);
      return existing.id;
    }
    const id = nextId();
    const base = DEFAULT_SIZE[appId];
    // If an explicit rect with x/y is provided, use it directly (no cascade, no auto-tile).
    // Otherwise, the window will be auto-tiled with the other windows.
    const hasExplicitPos = rect && (rect.x !== undefined || rect.y !== undefined);
    const alwaysOnTop = appId === "athena";
    const z = alwaysOnTop ? 10000 + state.zCounter + 1 : state.zCounter + 1;

    // For auto-tiling, start the new window at a reasonable size.
    // The retile() call will position it in the grid.
    const finalRect = clampToViewport(
      hasExplicitPos
        ? { ...base, ...rect }
        : { ...base, ...rect }
    );
    const win: WindowInstance = {
      id,
      appId,
      title,
      icon,
      rect: finalRect,
      snap: "none",
      zIndex: z,
      minimized: false,
      closing: false,
      alwaysOnTop,
      payload,
    };
    set({ windows: [...state.windows, win], focusedId: id, zCounter: z });

    // Auto-tile all windows unless an explicit position was provided.
    if (!hasExplicitPos) {
      get().retile();
    }
    return id;
  },

  close: (id) => {
    // Mark as closing to trigger exit animation, then remove after it plays.
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, closing: true } : w
      ),
      focusedId: s.focusedId === id ? null : s.focusedId,
    }));
    // Remove after animation duration (must match Window.tsx exit duration),
    // then retile remaining windows to fill the gap.
    setTimeout(() => {
      get().removeWindow(id);
      get().retile();
    }, 180);
  },

  removeWindow: (id) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
    })),

  focus: (id) =>
    set((s) => {
      const target = s.windows.find((w) => w.id === id);
      if (!target) return s;
      // Always-on-top windows get z in the 10000+ range; normal windows stay below.
      const z = target.alwaysOnTop ? 10000 + s.zCounter + 1 : s.zCounter + 1;
      return {
        zCounter: s.zCounter + 1,
        focusedId: id,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, zIndex: z, minimized: false } : w
        ),
      };
    }),

  minimize: (id) => {
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: !w.minimized } : w
      ),
      focusedId: s.focusedId === id ? null : s.focusedId,
    }));
    // Retile to fill/restore the gap when a window is minimized/restored.
    get().retile();
  },

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        const vw = window.innerWidth;
        const vh = window.innerHeight - TASKBAR_H;
        // Restore when explicitly maximized OR when effectively fullscreen
        // (e.g. auto-tiled single window has snap="none" but fills the screen).
        if (w.snap === "maximized" || isFullscreenRect(w.rect)) {
          return {
            ...w,
            snap: "none",
            rect: computeRestoredRect(w),
            prevRect: undefined,
          };
        }
        return {
          ...w,
          snap: "maximized",
          prevRect: w.rect,
          rect: { x: 0, y: 0, width: vw, height: vh },
        };
      }),
    })),

  snap: (id, zone) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        const vw = window.innerWidth;
        const vh = window.innerHeight - 48;
        if (zone === "none") {
          // If prevRect is missing or itself fullscreen, fall back to a
          // sensible default size so the window doesn't stay stuck fullscreen.
          const prev = w.prevRect;
          if (!prev || isFullscreenRect(prev)) {
            return {
              ...w,
              snap: "none",
              rect: computeRestoredRect(w),
              prevRect: undefined,
            };
          }
          return { ...w, snap: "none", rect: prev, prevRect: undefined };
        }
        if (zone === "maximized") {
          return {
            ...w,
            snap: "maximized",
            prevRect: w.snap === "none" ? w.rect : w.prevRect,
            rect: { x: 0, y: 0, width: vw, height: vh },
          };
        }
        const halfW = Math.floor(vw / 2);
        const halfH = Math.floor(vh / 2);
        const prevRect = w.snap === "none" ? w.rect : w.prevRect;
        let rect: WindowRect;
        switch (zone) {
          case "left":
            rect = { x: 0, y: 0, width: halfW, height: vh };
            break;
          case "right":
            rect = { x: halfW, y: 0, width: vw - halfW, height: vh };
            break;
          case "top-left":
            rect = { x: 0, y: 0, width: halfW, height: halfH };
            break;
          case "top-right":
            rect = { x: halfW, y: 0, width: vw - halfW, height: halfH };
            break;
          case "bottom-left":
            rect = { x: 0, y: halfH, width: halfW, height: vh - halfH };
            break;
          case "bottom-right":
            rect = { x: halfW, y: halfH, width: vw - halfW, height: vh - halfH };
            break;
          default:
            rect = w.rect;
        }
        return { ...w, snap: zone, prevRect, rect };
      }),
    })),

  setRect: (id, rect) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, rect } : w)),
    })),

  setTitle: (id, title) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
    })),

  restoreOrMinimize: (id) => {
    const w = get().windows.find((x) => x.id === id);
    if (!w) return;
    if (w.minimized) {
      // Restoring from minimized — un-minimize and retile so the window
      // fits into the grid alongside the others (instead of overlapping).
      get().focus(id);
      get().retile();
    } else if (get().focusedId === id) {
      get().minimize(id);
    } else {
      get().focus(id);
    }
  },

  cycleFocus: (direction) => {
    const s = get();
    const visible = s.windows.filter((w) => !w.minimized);
    if (visible.length === 0) return;
    const sorted = [...visible].sort((a, b) => a.zIndex - b.zIndex);
    const currentIdx = sorted.findIndex((w) => w.id === s.focusedId);
    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = direction === 1 ? sorted.length - 1 : 0;
    } else {
      nextIdx = (currentIdx + direction + sorted.length) % sorted.length;
    }
    get().focus(sorted[nextIdx].id);
  },

  closeAll: () => set({ windows: [], focusedId: null }),

  retile: () => {
    const layout = computeGridLayout(get().windows);
    if (Object.keys(layout).length === 0) return;
    set((s) => ({
      windows: s.windows.map((w) => {
        const newRect = layout[w.id];
        if (!newRect) return w;
        // Set tiling=true so the Window component enables CSS transitions
        // for a smooth slide animation. The flag is cleared on next interaction.
        return { ...w, rect: newRect, tiling: true, snap: "none" };
      }),
    }));
    // Clear the tiling flag after the transition completes so that
    // subsequent drag/resize operations don't have transitions.
    setTimeout(() => {
      set((s) => ({
        windows: s.windows.map((w) =>
          w.tiling ? { ...w, tiling: false } : w
        ),
      }));
    }, 350);
  },

  // ===== Mobile navigation implementations =====
  mobileOpen: ({ appId, title, icon, payload }) => {
    const id = nextId();
    const entry: MobileAppEntry = { id, appId, title, icon, payload };
    set((s) => ({
      mobileStack: [...s.mobileStack, entry],
      mobileActiveId: id,
      mobileOnHome: false,
    }));
    return id;
  },

  mobileClose: (id) => {
    set((s) => {
      const idx = s.mobileStack.findIndex((e) => e.id === id);
      if (idx === -1) return s;
      const stack = s.mobileStack.filter((e) => e.id !== id);
      // New active = the new top of stack, or null (go home) if empty.
      const newActive = stack.length > 0 ? stack[stack.length - 1].id : null;
      return {
        mobileStack: stack,
        mobileActiveId: newActive,
        mobileOnHome: newActive === null,
      };
    });
  },

  mobileBack: () => {
    const s = get();
    if (s.mobileOnHome || !s.mobileActiveId) return;
    get().mobileClose(s.mobileActiveId);
  },

  mobileGoHome: () => {
    set({ mobileActiveId: null, mobileOnHome: true });
  },

  mobileActivate: (id) => {
    set((s) => {
      const entry = s.mobileStack.find((e) => e.id === id);
      if (!entry) return s;
      // Move the entry to the top of the stack.
      const stack = [...s.mobileStack.filter((e) => e.id !== id), entry];
      return { mobileStack: stack, mobileActiveId: id, mobileOnHome: false };
    });
  },

  mobileSwitchTo: ({ appId, title, icon, payload }) => {
    // Used by bottom nav: replace the whole stack with a single fresh entry.
    // If the same app is already active, just go home-equivalent (no-op-ish).
    const id = nextId();
    const entry: MobileAppEntry = { id, appId, title, icon, payload };
    set({ mobileStack: [entry], mobileActiveId: id, mobileOnHome: false });
    return id;
  },
}));

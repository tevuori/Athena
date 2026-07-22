import { create } from "zustand";

export type AppId =
  | "notes"
  | "tasks"
  | "files"
  | "music"
  | "settings"
  | "terminal"
  | "pomodoro"
  | "flashcards"
  | "grades"
  | "vut"
  | "editor"
  | "viewer"
  | "athena";

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
}

let idCounter = 0;
const nextId = () => `win-${++idCounter}`;

const DEFAULT_SIZE: Record<AppId, WindowRect> = {
  notes: { x: 120, y: 80, width: 880, height: 600 },
  tasks: { x: 180, y: 100, width: 920, height: 560 },
  files: { x: 100, y: 60, width: 820, height: 560 },
  music: { x: 220, y: 120, width: 760, height: 620 },
  settings: { x: 260, y: 140, width: 720, height: 540 },
  terminal: { x: 200, y: 160, width: 700, height: 440 },
  pomodoro: { x: 300, y: 100, width: 420, height: 560 },
  flashcards: { x: 160, y: 80, width: 880, height: 600 },
  grades: { x: 140, y: 70, width: 920, height: 620 },
  vut: { x: 120, y: 60, width: 960, height: 660 },
  editor: { x: 160, y: 70, width: 920, height: 640 },
  viewer: { x: 200, y: 90, width: 820, height: 620 },
  athena: { x: 200, y: 90, width: 760, height: 620 },
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

export const useWindows = create<WindowsState>((set, get) => ({
  windows: [],
  focusedId: null,
  zCounter: 10,

  open: ({ appId, title, icon, payload, rect }) => {
    const state = get();
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
    const finalRect = clampToViewport({
      ...base,
      ...rect,
      // cascade offset
      x: base.x + (state.windows.length % 5) * 28,
      y: base.y + (state.windows.length % 5) * 24,
    });
    const z = state.zCounter + 1;
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
      payload,
    };
    set({ windows: [...state.windows, win], focusedId: id, zCounter: z });
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
    // Remove after animation duration (must match Window.tsx exit duration)
    setTimeout(() => {
      get().removeWindow(id);
    }, 180);
  },

  removeWindow: (id) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
    })),

  focus: (id) =>
    set((s) => {
      const z = s.zCounter + 1;
      return {
        zCounter: z,
        focusedId: id,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, zIndex: z, minimized: false } : w
        ),
      };
    }),

  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: !w.minimized } : w
      ),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.snap === "maximized") {
          return { ...w, snap: "none", rect: w.prevRect ?? w.rect };
        }
        return {
          ...w,
          snap: "maximized",
          prevRect: w.rect,
          rect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight - 48 },
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
          return { ...w, snap: "none", rect: w.prevRect ?? w.rect };
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
      get().focus(id);
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
}));

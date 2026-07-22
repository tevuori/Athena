import { create } from "zustand";

export interface Notification {
  id: string;
  app: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

let nid = 0;

interface NotificationsState {
  items: Notification[];
  dnd: boolean;
  push: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  setDnd: (v: boolean) => void;
  unreadCount: () => number;
}

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  dnd: false,
  push: (n) => {
    // Suppress notifications when DND is on
    if (get().dnd) return;
    set((s) => ({
      items: [
        { ...n, id: `n-${++nid}`, timestamp: Date.now(), read: false },
        ...s.items,
      ].slice(0, 50),
    }));
  },
  markRead: (id) =>
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  clearAll: () => set({ items: [] }),
  setDnd: (v) => set({ dnd: v }),
  unreadCount: () => get().items.filter((n) => !n.read).length,
}));

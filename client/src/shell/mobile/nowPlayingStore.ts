import { create } from "zustand";

/** Open/close state for the mobile Now Playing sheet, shared with MiniPlayer. */
interface NowPlayingState {
  open: boolean;
  setOpen: (b: boolean) => void;
  toggle: () => void;
}

export const useNowPlaying = create<NowPlayingState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));

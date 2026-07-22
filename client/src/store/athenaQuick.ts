import { create } from "zustand";

interface AthenaQuickState {
  open: boolean;
  setOpen: (b: boolean) => void;
  toggle: () => void;
}

export const useAthenaQuick = create<AthenaQuickState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));

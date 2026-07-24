/**
 * Zustand store that drives the in-app update dialog.
 *
 * The dialog itself (shell/UpdateDialog.tsx) is rendered once at the top of
 * the React tree and reads from this store. Any caller can open the dialog
 * by calling `promptUpdate(info)` — e.g. the Capacitor auto-check on native
 * startup, or the "Check for updates" button in Settings → About.
 */
import { create } from "zustand";
import type { UpdateInfo } from "../services/updater";

interface UpdaterState {
  /** The update being presented, or null when the dialog is closed. */
  pending: UpdateInfo | null;
  /** Open the dialog with the given update info. */
  promptUpdate: (info: UpdateInfo) => void;
  /** Close the dialog without changing skip state. */
  dismiss: () => void;
}

export const useUpdater = create<UpdaterState>((set) => ({
  pending: null,
  promptUpdate: (info) => set({ pending: info }),
  dismiss: () => set({ pending: null }),
}));

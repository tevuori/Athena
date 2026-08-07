// ===== Feature flags / app availability store =====
// Loads the current user's feature state (beta toggle, VUT grant, global
// disabled-apps kill switch) from /api/features and exposes a derived
// `availableApps` list + `isAppAvailable()` used by all app launch surfaces
// and the window manager's open() guard.
//
// App tier classification lives in apps/registry.tsx and is mirrored on the
// server in services/features.ts — keep them in sync.

import { create } from "zustand";
import { useEffect, useMemo } from "react";
import { APPS, APP_MAP, type AppDefinition } from "../apps/registry";
import type { AppId } from "./windows";
import { api } from "../services/api";

interface FeaturesState {
  betaEnabled: boolean;
  vutGranted: boolean;
  /** Globally disabled app ids (admin kill switch). */
  disabledApps: Set<string>;
  loaded: boolean;

  load: () => Promise<void>;
  setBeta: (enabled: boolean) => Promise<void>;
  /** Refresh grants/disabled state (e.g. after an admin change). */
  refresh: () => Promise<void>;
}

export const useFeatures = create<FeaturesState>((set, get) => ({
  betaEnabled: false,
  vutGranted: false,
  disabledApps: new Set(),
  loaded: false,

  load: async () => {
    try {
      const data = await api.get<{ betaEnabled: boolean; vutGranted: boolean; disabledApps: string[] }>(
        "/api/features"
      );
      set({
        betaEnabled: data.betaEnabled,
        vutGranted: data.vutGranted,
        disabledApps: new Set(data.disabledApps),
        loaded: true,
      });
    } catch {
      // Non-fatal: default to most-restrictive (everything core-only). This
      // also covers the pre-login / loading window where launch surfaces
      // aren't rendered yet.
      set({ loaded: true });
    }
  },

  setBeta: async (enabled) => {
    const data = await api.put<{ betaEnabled: boolean }>("/api/features/beta", { enabled });
    set({ betaEnabled: data.betaEnabled });
  },

  refresh: () => get().load(),
}));

/** Settings is always available (can't be disabled — would lock users out). */
const UNDISABLEABLE = new Set<AppId>(["settings"]);

/**
 * Whether an app is available to the current user, combining the global kill
 * switch, the per-user beta toggle, and the per-user VUT grant. Pure function
 * over the store's current state — safe to call from the windows store without
 * subscribing to React updates.
 */
export function isAppAvailable(appId: AppId): boolean {
  const { disabledApps, betaEnabled, vutGranted } = useFeatures.getState();
  if (UNDISABLEABLE.has(appId)) return true;
  if (disabledApps.has(appId)) return false;
  const def = APP_MAP[appId];
  if (!def) return false;
  if (def.requiresGrant === "vut") return vutGranted;
  if (def.tier === "beta") return betaEnabled;
  return true;
}

/** Apps visible to the current user in launch surfaces (Start menu, desktop,
 *  taskbar, command palette, mobile launcher). */
export function availableApps(): AppDefinition[] {
  return APPS.filter((a) => isAppAvailable(a.id));
}

/**
 * Reactive hook: returns the list of apps available to the current user,
 * re-rendering when the feature flags change. Use in launch surfaces.
 */
export function useAvailableApps(): AppDefinition[] {
  const betaEnabled = useFeatures((s) => s.betaEnabled);
  const vutGranted = useFeatures((s) => s.vutGranted);
  const disabledApps = useFeatures((s) => s.disabledApps);
  return useMemo(
    () =>
      APPS.filter((a) => {
        if (UNDISABLEABLE.has(a.id)) return true;
        if (disabledApps.has(a.id)) return false;
        if (a.requiresGrant === "vut") return vutGranted;
        if (a.tier === "beta") return betaEnabled;
        return true;
      }),
    [betaEnabled, vutGranted, disabledApps]
  );
}

/** Reactive hook: returns isAppAvailable for a single app id. */
export function useAppAvailable(appId: AppId): boolean {
  const betaEnabled = useFeatures((s) => s.betaEnabled);
  const vutGranted = useFeatures((s) => s.vutGranted);
  const disabledApps = useFeatures((s) => s.disabledApps);
  if (UNDISABLEABLE.has(appId)) return true;
  if (disabledApps.has(appId)) return false;
  const def = APP_MAP[appId];
  if (!def) return false;
  if (def.requiresGrant === "vut") return vutGranted;
  if (def.tier === "beta") return betaEnabled;
  return true;
}

/** Convenience: ensures features are loaded for the current session. Returns
 *  the loaded flag so callers can defer rendering until ready (optional). */
export function useFeaturesLoaded(): boolean {
  const loaded = useFeatures((s) => s.loaded);
  const load = useFeatures((s) => s.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  return loaded;
}

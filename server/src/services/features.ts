// ===== Feature flags / app availability =====
// Controls which apps a user can access:
//   - Per-user "beta" toggle: unlocks apps classified as tier "beta".
//   - Per-user "vut" grant: admin-gated access to the VUT + Moodle apps
//     (and their API routes). Moodle rides on the VUT SSO session, so a
//     single grant covers both.
//   - Global "disabled apps" kill switch (admin): temporarily disables an
//     app for everyone regardless of tier/grant. Settings is never disableable.
//
// All flags are stored in the Setting key/value table. Global flags use
// userId = null; per-user flags use the user's id. The app tier classification
// is mirrored on the client in client/src/apps/registry.tsx — keep them in sync.

import prisma from "../db/client";

export type AppTier = "core" | "beta";

/** Apps that require an admin-granted "vut" access flag (VUT + Moodle). */
export const VUT_GRANT_APPS = new Set<string>(["vut", "moodle"]);

/** Apps that are always available (not gated by the beta toggle). */
export const CORE_APPS = new Set<string>([
  "notes",
  "tasks",
  "files",
  "whiteboard",
  "study",
  "athena",
  "today",
  "settings",
]);

/** Settings can never be disabled (would lock the user out of configuration). */
export const UNDISABLEABLE_APPS = new Set<string>(["settings"]);

/** Full catalog of app ids the admin can toggle. */
export const ALL_APP_IDS: string[] = [
  "notes", "tasks", "files", "whiteboard", "study", "athena", "today", "settings",
  "pomodoro", "flashcards", "grades", "editor", "viewer", "calendar", "habits",
  "ntfy", "voice", "browser", "reminders", "analytics", "maps",
  "vut", "moodle",
];

export function appTier(appId: string): AppTier {
  if (CORE_APPS.has(appId)) return "core";
  return "beta";
}

// ----- per-user beta toggle -----

const BETA_KEY = "beta.enabled";

export async function getUserBeta(userId: string): Promise<boolean> {
  const s = await prisma.setting.findFirst({ where: { userId, key: BETA_KEY } });
  return s?.value === "true";
}

export async function setUserBeta(userId: string, enabled: boolean): Promise<void> {
  const value = enabled ? "true" : "false";
  const existing = await prisma.setting.findFirst({ where: { userId, key: BETA_KEY } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({ data: { userId, key: BETA_KEY, value } });
  }
}

// ----- per-user VUT grant (admin-controlled) -----

const VUT_GRANT_KEY = "vut.access";

export async function getVutGrant(userId: string): Promise<boolean> {
  const s = await prisma.setting.findFirst({ where: { userId, key: VUT_GRANT_KEY } });
  return s?.value === "true";
}

export async function setVutGrant(userId: string, enabled: boolean): Promise<void> {
  const value = enabled ? "true" : "false";
  const existing = await prisma.setting.findFirst({ where: { userId, key: VUT_GRANT_KEY } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({ data: { userId, key: VUT_GRANT_KEY, value } });
  }
}

// ----- global disabled-apps kill switch (admin) -----

const DISABLED_APPS_KEY = "apps.disabled";

export async function getGlobalDisabledApps(): Promise<Set<string>> {
  const s = await prisma.setting.findFirst({ where: { userId: null, key: DISABLED_APPS_KEY } });
  if (!s?.value) return new Set();
  try {
    const arr = JSON.parse(s.value) as unknown;
    if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
      return new Set(arr.filter((a) => !UNDISABLEABLE_APPS.has(a)));
    }
  } catch {
    /* corrupt JSON — treat as empty */
  }
  return new Set();
}

export async function setGlobalDisabledApps(apps: string[]): Promise<void> {
  // Filter out undisableable apps + dedupe.
  const clean = Array.from(new Set(apps.filter((a) => !UNDISABLEABLE_APPS.has(a))));
  const value = JSON.stringify(clean);
  const existing = await prisma.setting.findFirst({ where: { userId: null, key: DISABLED_APPS_KEY } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({ data: { userId: null, key: DISABLED_APPS_KEY, value } });
  }
}

// ----- combined availability check -----

/**
 * Whether `appId` is available for `userId`, combining the global kill
 * switch, the per-user beta toggle, and the per-user VUT grant.
 */
export async function isAppAvailableFor(userId: string, appId: string): Promise<boolean> {
  if (UNDISABLEABLE_APPS.has(appId)) return true;
  const disabled = await getGlobalDisabledApps();
  if (disabled.has(appId)) return false;
  if (VUT_GRANT_APPS.has(appId)) {
    return getVutGrant(userId);
  }
  if (appTier(appId) === "beta") {
    return getUserBeta(userId);
  }
  return true;
}

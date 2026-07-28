// ===== Per-user timezone helper =====
// The server's system clock may run in a different timezone than the user
// (e.g. a VPS in UTC serving a user in Europe/Prague). All server-side
// schedulers (ntfy cron, proactive alerts, reminders) and the Athena system
// prompt must interpret wall-clock times in the user's configured IANA
// timezone, not the server's local timezone.
//
// The timezone is stored as a per-user Setting row (key="timezone") and cached
// in-memory after first read. Default fallback is the server's system
// timezone (Intl.DateTimeFormat().resolvedOptions().timeZone), which preserves
// pre-setting behavior until the user explicitly picks one.

import { Cron } from "croner";
import prisma from "../db/client";

const SETTING_KEY = "timezone";

/** Server system timezone (resolved once at startup). Used as the default. */
export const SERVER_TIMEZONE: string =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// userId -> IANA timezone. Cached after first load; cleared on set.
const tzCache = new Map<string, string>();

/** Validate an IANA timezone string by constructing a DateTimeFormat with it. */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    // Throws RangeError for invalid timezones.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Get the user's configured timezone, falling back to the server system tz. */
export async function getUserTimezone(userId: string): Promise<string> {
  const cached = tzCache.get(userId);
  if (cached) return cached;
  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key: SETTING_KEY } },
  });
  const tz = row?.value && isValidTimezone(row.value) ? row.value : SERVER_TIMEZONE;
  tzCache.set(userId, tz);
  return tz;
}

/** Set (upsert) the user's timezone and update the cache. */
export async function setUserTimezone(userId: string, tz: string): Promise<void> {
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: SETTING_KEY } },
    create: { userId, key: SETTING_KEY, value: tz },
    update: { value: tz },
  });
  tzCache.set(userId, tz);
}

/**
 * Compute the next run time of a 5-field cron expression in the user's
 * timezone, returned as a UTC Date. Croner's `timezone` option handles DST
 * and wall-clock semantics correctly.
 */
export function nextRunInTz(
  expr: string,
  tz: string,
  from: Date = new Date()
): Date {
  const c = new Cron(expr, { timezone: tz });
  const next = c.nextRun(from);
  return next ?? new Date(Date.now() + 86400000);
}

/**
 * Compute the next occurrence of `hour:minute` (wall-clock) in the given
 * timezone after `from` (defaults to now), returned as a UTC Date.
 *
 * Replaces the old `setHours`-based computeNextRunAt which used the server's
 * local timezone. This version iterates day-by-day in the target timezone so
 * DST transitions and non-integer-offset zones are handled correctly.
 */
export function computeNextOccurrence(
  hour: number,
  minute: number,
  tz: string,
  from: Date = new Date()
): Date {
  // Walk forward in 1-day steps starting from `from`, checking whether the
  // target wall-clock time on that calendar day (in `tz`) is strictly after
  // `from`. Bounded to ~2 days in practice (always within 1 day), but cap at
  // 3 to be safe against DST edge cases.
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const candidate = wallClockOnDay(hour, minute, tz, from, dayOffset);
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  // Fallback (shouldn't happen): 1 day from now in tz.
  return wallClockOnDay(hour, minute, tz, from, 1);
}

/**
 * Build a UTC Date for `hour:minute` on the calendar day that is `dayOffset`
 * days after `from`, interpreted in timezone `tz`.
 *
 * Uses Intl to find the calendar date components in `tz`, then assembles the
 * wall-clock time and converts to UTC via the zone's offset at that instant.
 */
function wallClockOnDay(
  hour: number,
  minute: number,
  tz: string,
  from: Date,
  dayOffset: number
): Date {
  // Determine the calendar Y-M-D in the target tz for `from + dayOffset days`.
  const base = new Date(from.getTime() + dayOffset * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const y = Number(get("year"));
  const m = Number(get("month")) - 1;
  const d = Number(get("day"));

  // Construct the wall-clock time as if it were UTC, then apply the zone's
  // offset at that instant to get the real UTC time.
  const wallUtc = Date.UTC(y, m, d, hour, minute, 0, 0);
  // Compute the zone's offset at the wall-clock instant (minutes east of UTC).
  // We format the same wall-clock instant in the target tz and compare to UTC.
  const asDate = new Date(wallUtc);
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(asDate);
  const tzGet = (type: string): number =>
    Number(partsFind(tzParts, type) ?? "0");
  const tzY = tzGet("year");
  const tzM = tzGet("month") - 1;
  const tzD = tzGet("day");
  const tzH = tzGet("hour") % 24; // hour 24 can appear for midnight
  const tzMin = tzGet("minute");
  const tzSec = tzGet("second");
  const wallAsTzUtc = Date.UTC(tzY, tzM, tzD, tzH, tzMin, tzSec, 0);
  const offsetMs = wallAsTzUtc - wallUtc; // how far tz is ahead of UTC at this instant
  return new Date(wallUtc - offsetMs);
}

function partsFind(parts: Intl.DateTimeFormatPart[], type: string): string | undefined {
  return parts.find((p) => p.type === type)?.value;
}

/**
 * Parse a fireAt value (ISO 8601 string or epoch number) into a UTC Date.
 * If the string carries an explicit timezone designator (trailing `Z` or
 * `+HH:MM`/`-HH:MM`), it is parsed normally. If it is a NAIVE datetime
 * (no designator, e.g. "2026-07-25T15:00:00" as Athena sometimes emits),
 * it is interpreted in the given user timezone and converted to UTC.
 */
export function parseFireAtInTz(raw: unknown, tz: string): Date | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  if (typeof raw === "number") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = raw.trim();
  // Explicit designator? Z, +HH:MM, -HH:MM (with or without colons).
  if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // Naive datetime — interpret wall-clock in `tz`.
  // Accept "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD HH:mm[:ss]".
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    // Last resort: let Date parse (server-local) — better than nothing.
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, ys, mos, ds, hs, mins, secs] = m;
  const wallUtc = Date.UTC(
    Number(ys),
    Number(mos) - 1,
    Number(ds),
    Number(hs),
    Number(mins),
    Number(secs ?? 0),
    0
  );
  // Apply the zone offset at that wall-clock instant.
  const asDate = new Date(wallUtc);
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(asDate);
  const tzGet = (type: string): number => Number(partsFind(tzParts, type) ?? "0");
  const wallAsTzUtc = Date.UTC(
    tzGet("year"),
    tzGet("month") - 1,
    tzGet("day"),
    tzGet("hour") % 24,
    tzGet("minute"),
    tzGet("second"),
    0
  );
  const offsetMs = wallAsTzUtc - wallUtc;
  return new Date(wallUtc - offsetMs);
}

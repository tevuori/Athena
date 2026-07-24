// ===== LLM rate limiter =====
// In-memory sliding-window rate limiter for LLM requests. Tracks requests per
// user with two windows: requests-per-day (RPD) and requests-per-minute (RPM).
// Used to protect free-tier models (e.g. OpenRouter :free variants) from
// hitting rate limits. When a request would exceed the limit, the caller can
// fall back to a secondary LLM or reject the request.

interface RateWindow {
  /** Timestamps (ms) of requests in the last 24h. */
  day: number[];
  /** Timestamps (ms) of requests in the last 60s. */
  minute: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

class LlmRateLimiter {
  private windows = new Map<string, RateWindow>();

  /** Prune expired timestamps from a window. */
  private prune(win: RateWindow, now: number): void {
    const dayCutoff = now - DAY_MS;
    const minuteCutoff = now - MINUTE_MS;
    win.day = win.day.filter((t) => t > dayCutoff);
    win.minute = win.minute.filter((t) => t > minuteCutoff);
  }

  private getOrCreate(userId: string): RateWindow {
    let win = this.windows.get(userId);
    if (!win) {
      win = { day: [], minute: [] };
      this.windows.set(userId, win);
    }
    return win;
  }

  /**
   * Check if a new request would exceed the rate limits.
   * Returns `{ allowed, dayCount, minuteCount, dayLimit, minuteLimit }`.
   * Does NOT consume a slot — call `record()` after the request succeeds.
   */
  check(
    userId: string,
    dayLimit: number,
    minuteLimit: number
  ): {
    allowed: boolean;
    dayCount: number;
    minuteCount: number;
    dayLimit: number;
    minuteLimit: number;
  } {
    const now = Date.now();
    const win = this.getOrCreate(userId);
    this.prune(win, now);
    const dayCount = win.day.length;
    const minuteCount = win.minute.length;
    const allowed = dayCount < dayLimit && minuteCount < minuteLimit;
    return { allowed, dayCount, minuteCount, dayLimit, minuteLimit };
  }

  /** Record a successful request (consume a slot in both windows). */
  record(userId: string): void {
    const now = Date.now();
    const win = this.getOrCreate(userId);
    this.prune(win, now);
    win.day.push(now);
    win.minute.push(now);
  }

  /** Get current usage stats without consuming a slot. */
  stats(userId: string): { dayCount: number; minuteCount: number } {
    const now = Date.now();
    const win = this.getOrCreate(userId);
    this.prune(win, now);
    return { dayCount: win.day.length, minuteCount: win.minute.length };
  }

  /** Reset all counters for a user (e.g. after changing config). */
  reset(userId: string): void {
    this.windows.delete(userId);
  }
}

export const llmRateLimiter = new LlmRateLimiter();

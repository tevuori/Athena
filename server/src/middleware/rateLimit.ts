import type { Context, Next } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory IP-based rate limiter.
 * Not suitable for multi-instance deployments, but fine for a single-process
 * Bun server. Limits `max` requests per `windowMs` per client IP.
 */
export function rateLimit(opts: { max: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();
  // Periodically purge expired buckets to avoid unbounded growth.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(ip);
    }
  }, opts.windowMs).unref?.();

  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(ip, b);
    }
    b.count++;
    if (b.count > opts.max) {
      c.header("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      return c.json({ error: "Too many requests. Try again later." }, 429);
    }
    await next();
  };
}

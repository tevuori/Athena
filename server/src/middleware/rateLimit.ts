import type { Context, Next } from "hono";
import type Redis from "ioredis";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Redis client (lazily initialized). When `REDIS_URL` is set, the rate limiter
 * uses Redis for shared state across multiple server instances. When unset,
 * falls back to the in-memory Map implementation (fine for single-container).
 */
let redisClient: Redis | null = null;
let redisInitPromise: Promise<Redis | null> | null = null;

async function getRedis(): Promise<Redis | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient) return redisClient;
  if (redisInitPromise) return redisInitPromise;
  redisInitPromise = (async () => {
    const IORedis = (await import("ioredis")).default;
    const client = new IORedis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      console.error("[rate-limit] Redis error:", err.message);
    });
    redisClient = client;
    return client;
  })();
  return redisInitPromise;
}

/**
 * IP-based rate limiter.
 *
 * When `REDIS_URL` is set: uses Redis INCR + EXPIRE for shared state across
 * multiple server instances (horizontal scaling). This is the production path.
 *
 * When `REDIS_URL` is unset: uses an in-memory Map (single-container fallback).
 * State is lost on restart and not shared across instances, but works fine for
 * local dev and single-container deployments.
 *
 * Limits `max` requests per `windowMs` per client IP.
 */
export function rateLimit(opts: { max: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();
  // Periodically purge expired buckets to avoid unbounded growth (in-memory only).
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
    const windowSeconds = Math.ceil(opts.windowMs / 1000);
    const key = `ratelimit:${ip}:${Math.floor(now / opts.windowMs)}`;

    const redis = await getRedis();
    if (redis) {
      // Redis path — atomic INCR + EXPIRE, shared across instances.
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, windowSeconds);
        }
        if (count > opts.max) {
          const ttl = await redis.ttl(key);
          c.header("Retry-After", String(Math.max(1, ttl)));
          return c.json({ error: "Too many requests. Try again later." }, 429);
        }
        await next();
        return;
      } catch (err) {
        // Redis down — fall through to in-memory as a safety net.
        console.warn("[rate-limit] Redis unavailable, falling back to in-memory:", (err as Error).message);
      }
    }

    // In-memory path (fallback or no Redis configured).
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

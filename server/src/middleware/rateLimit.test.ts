import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./rateLimit";

/**
 * Tests for the in-memory rate limiter (no Redis configured).
 * The Redis path is tested implicitly in integration tests.
 */

function makeApp(max: number, windowMs: number) {
  const app = new Hono();
  app.use("*", rateLimit({ max, windowMs }));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(app: Hono, ip = "1.2.3.4") {
  return app.request("http://localhost/", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimit middleware (in-memory)", () => {
  const origRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (origRedisUrl) process.env.REDIS_URL = origRedisUrl;
  });

  it("allows requests under the limit", async () => {
    const app = makeApp(5, 60_000);
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app);
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when the limit is exceeded", async () => {
    const app = makeApp(2, 60_000);
    await makeRequest(app);
    await makeRequest(app);
    const res = await makeRequest(app);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Too many requests");
  });

  it("includes Retry-After header on 429", async () => {
    const app = makeApp(1, 60_000);
    await makeRequest(app);
    const res = await makeRequest(app);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("tracks IPs independently", async () => {
    const app = makeApp(2, 60_000);
    // IP 1 uses both slots.
    await makeRequest(app, "1.1.1.1");
    await makeRequest(app, "1.1.1.1");
    // IP 2 should still be allowed.
    const res = await makeRequest(app, "2.2.2.2");
    expect(res.status).toBe(200);
  });

  it("falls back to 'unknown' IP when no headers", async () => {
    const app = makeApp(1, 60_000);
    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
  });
});

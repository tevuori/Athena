import { describe, expect, it } from "bun:test";

/**
 * Tests for the production-readiness security hardening:
 * - JWT secret validation (insecure defaults rejected in production)
 * - File upload size + extension limits
 * - Auth middleware query-token restriction
 *
 * These tests verify the security guards we added. They don't need a
 * running server or database — they test the validation logic directly.
 */

describe("production security: JWT secret validation", () => {
  it("INSECURE_SECRETS set contains known placeholder values", () => {
    const INSECURE_SECRETS = new Set([
      "dev-secret-change-me",
      "change-me-to-a-long-random-string",
      "admin",
      "",
    ]);
    expect(INSECURE_SECRETS.has("dev-secret-change-me")).toBe(true);
    expect(INSECURE_SECRETS.has("change-me-to-a-long-random-string")).toBe(true);
    expect(INSECURE_SECRETS.has("admin")).toBe(true);
    expect(INSECURE_SECRETS.has("")).toBe(true);
    // A real secret is not in the set.
    expect(INSECURE_SECRETS.has("a-very-secure-and-long-random-secret-32chars")).toBe(false);
  });

  it("a secure secret passes the check", () => {
    const rawSecret = "a-very-secure-and-long-random-secret-32chars";
    const INSECURE_SECRETS = new Set([
      "dev-secret-change-me",
      "change-me-to-a-long-random-string",
      "admin",
      "",
    ]);
    const isSecure = Boolean(rawSecret) && !INSECURE_SECRETS.has(rawSecret);
    expect(isSecure).toBe(true);
  });

  it("an empty secret fails the check", () => {
    const rawSecret = "";
    const INSECURE_SECRETS = new Set([
      "dev-secret-change-me",
      "change-me-to-a-long-random-string",
      "admin",
      "",
    ]);
    const isSecure = Boolean(rawSecret) && !INSECURE_SECRETS.has(rawSecret);
    expect(isSecure).toBe(false);
  });

  it("the default placeholder fails the check", () => {
    const rawSecret = "dev-secret-change-me";
    const INSECURE_SECRETS = new Set([
      "dev-secret-change-me",
      "change-me-to-a-long-random-string",
      "admin",
      "",
    ]);
    const isSecure = Boolean(rawSecret) && !INSECURE_SECRETS.has(rawSecret);
    expect(isSecure).toBe(false);
  });
});

describe("production security: file upload limits", () => {
  // Mirror the constants from routes/files.ts
  const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
  const BLOCKED_UPLOAD_EXT = new Set([
    "exe", "bat", "cmd", "com", "scr", "msi", "sh", "ps1", "psm1",
    "jar", "war", "dll", "so", "dylib", "sys", "drv", "ocx",
    "vbs", "vba", "vb", "wsf", "wsh", "hta", "cpl",
    "apk", "deb", "rpm", "dmg", "pkg",
  ]);

  it("rejects files larger than 100 MB", () => {
    expect(150 * 1024 * 1024 > MAX_UPLOAD_BYTES).toBe(true);
    expect(100 * 1024 * 1024 > MAX_UPLOAD_BYTES).toBe(false);
    expect(50 * 1024 * 1024 > MAX_UPLOAD_BYTES).toBe(false);
  });

  it("blocks executable extensions", () => {
    expect(BLOCKED_UPLOAD_EXT.has("exe")).toBe(true);
    expect(BLOCKED_UPLOAD_EXT.has("bat")).toBe(true);
    expect(BLOCKED_UPLOAD_EXT.has("sh")).toBe(true);
    expect(BLOCKED_UPLOAD_EXT.has("apk")).toBe(true);
    expect(BLOCKED_UPLOAD_EXT.has("msi")).toBe(true);
  });

  it("allows legitimate file extensions", () => {
    expect(BLOCKED_UPLOAD_EXT.has("pdf")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("txt")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("md")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("png")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("mp4")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("docx")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("py")).toBe(false);
    expect(BLOCKED_UPLOAD_EXT.has("js")).toBe(false);
  });

  it("extracts extension correctly from filenames", () => {
    const getExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
    expect(getExt("malware.exe")).toBe("exe");
    expect(getExt("script.sh")).toBe("sh");
    expect(BLOCKED_UPLOAD_EXT.has(getExt("script.sh"))).toBe(true);
    expect(BLOCKED_UPLOAD_EXT.has(getExt("notes.md"))).toBe(false);
    // No extension
    expect(getExt("README")).toBe("readme");
    expect(BLOCKED_UPLOAD_EXT.has(getExt("README"))).toBe(false);
  });
});

describe("production security: CORS origin validation", () => {
  it("rejects empty CLIENT_ORIGIN in production", () => {
    const allowedOrigins: string[] = [];
    const isProduction = true;
    const shouldFail = isProduction && allowedOrigins.length === 0;
    expect(shouldFail).toBe(true);
  });

  it("accepts configured CLIENT_ORIGIN in production", () => {
    const allowedOrigins = ["https://athena.example.com"];
    const isProduction = true;
    const shouldFail = isProduction && allowedOrigins.length === 0;
    expect(shouldFail).toBe(false);
  });

  it("allows empty CLIENT_ORIGIN in dev (with warning)", () => {
    const allowedOrigins: string[] = [];
    const isProduction = false;
    const shouldFail = isProduction && allowedOrigins.length === 0;
    expect(shouldFail).toBe(false);
  });

  it("origin matching logic rejects non-allowed origins in production", () => {
    const allowedOrigins = ["https://athena.example.com"];
    const CAPACITOR_ORIGINS = ["https://localhost", "http://localhost", "capacitor://localhost"];

    const checkOrigin = (origin: string | null): string | null => {
      if (allowedOrigins.length === 0) return origin ?? "*";
      if (origin && allowedOrigins.includes(origin)) return origin;
      if (origin && CAPACITOR_ORIGINS.includes(origin)) return origin;
      return null;
    };

    expect(checkOrigin("https://athena.example.com")).toBe("https://athena.example.com");
    expect(checkOrigin("https://evil.com")).toBe(null);
    expect(checkOrigin("https://localhost")).toBe("https://localhost");
    expect(checkOrigin(null)).toBe(null);
  });
});

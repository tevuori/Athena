import { describe, expect, it, afterEach } from "bun:test";
import { sendEmail, getAppBaseUrl, sendPasswordResetEmail } from "./email";

/**
 * Tests for the email service in dev mode (no SMTP_URL configured).
 * In this mode, emails are logged to the console instead of sent.
 */

describe("email service (dev mode — no SMTP)", () => {
  const origSmtpUrl = process.env.SMTP_URL;
  const origAppBaseUrl = process.env.APP_BASE_URL;
  const origServerHost = process.env.SERVER_HOST;
  const origServerPort = process.env.SERVER_PORT;
  const origNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (origSmtpUrl) process.env.SMTP_URL = origSmtpUrl;
    else delete process.env.SMTP_URL;
    if (origAppBaseUrl) process.env.APP_BASE_URL = origAppBaseUrl;
    else delete process.env.APP_BASE_URL;
    if (origServerHost) process.env.SERVER_HOST = origServerHost;
    else delete process.env.SERVER_HOST;
    if (origServerPort) process.env.SERVER_PORT = origServerPort;
    else delete process.env.SERVER_PORT;
    if (origNodeEnv) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;
  });

  it("sendEmail returns false when no SMTP is configured (dev mode)", async () => {
    delete process.env.SMTP_URL;
    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      text: "Hello world",
    });
    expect(result).toBe(false);
  });

  it("getAppBaseUrl uses APP_BASE_URL when set (strips trailing slash)", () => {
    process.env.APP_BASE_URL = "https://athena.example.com/";
    expect(getAppBaseUrl()).toBe("https://athena.example.com");
  });

  it("getAppBaseUrl falls back to server host:port", () => {
    delete process.env.APP_BASE_URL;
    process.env.SERVER_HOST = "0.0.0.0";
    process.env.SERVER_PORT = "3001";
    process.env.NODE_ENV = "development";
    expect(getAppBaseUrl()).toBe("http://0.0.0.0:3001");
  });

  it("getAppBaseUrl uses https in production", () => {
    delete process.env.APP_BASE_URL;
    process.env.SERVER_HOST = "athena.example.com";
    process.env.SERVER_PORT = "443";
    process.env.NODE_ENV = "production";
    expect(getAppBaseUrl()).toBe("https://athena.example.com:443");
  });

  it("sendPasswordResetEmail returns false in dev mode (no SMTP)", async () => {
    delete process.env.SMTP_URL;
    const result = await sendPasswordResetEmail({
      to: "user@example.com",
      username: "alice",
      resetToken: "abc123",
    });
    expect(result).toBe(false);
  });
});

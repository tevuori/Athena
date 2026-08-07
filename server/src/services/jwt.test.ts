import { describe, expect, it } from "bun:test";
import { signToken, verifyToken } from "./jwt";

/**
 * Tests for the JWT service — token signing, verification, and the
 * TOTP challenge token flow used by 2FA login.
 */

describe("jwt service", () => {
  describe("signToken + verifyToken", () => {
    it("round-trips a standard token", async () => {
      const token = await signToken({ sub: "user-123", username: "alice" });
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-123");
      expect(payload!.username).toBe("alice");
      expect(payload!.totpChallenge).toBe(false);
    });

    it("round-trips a TOTP challenge token", async () => {
      const token = await signToken(
        { sub: "user-456", username: "bob", totpChallenge: true },
        "10m"
      );
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-456");
      expect(payload!.username).toBe("bob");
      expect(payload!.totpChallenge).toBe(true);
    });

    it("rejects a malformed token", async () => {
      const payload = await verifyToken("not-a-jwt");
      expect(payload).toBeNull();
    });

    it("rejects an empty string", async () => {
      const payload = await verifyToken("");
      expect(payload).toBeNull();
    });

    it("produces different tokens for different payloads", async () => {
      const t1 = await signToken({ sub: "user-1", username: "alice" });
      const t2 = await signToken({ sub: "user-2", username: "bob" });
      expect(t1).not.toBe(t2);
    });

    it("standard token does not have totpChallenge flag", async () => {
      const token = await signToken({ sub: "user-123", username: "alice" });
      const payload = await verifyToken(token);
      expect(payload!.totpChallenge).toBe(false);
    });
  });
});

import { describe, expect, it } from "bun:test";
import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  buildTotpUri,
  verifyTotp,
  verifyTotpPlain,
} from "./totp";
import { authenticator } from "otplib";

describe("totp service", () => {
  describe("generateTotpSecret", () => {
    it("generates a base32-encoded secret of reasonable length", () => {
      const secret = generateTotpSecret();
      // otplib generateSecret() returns a 32-char base32 string by default.
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThanOrEqual(16);
    });

    it("generates unique secrets on each call", () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe("encryptTotpSecret / decryptTotpSecret", () => {
    it("round-trips a secret through encryption", () => {
      const plain = generateTotpSecret();
      const encrypted = encryptTotpSecret(plain);
      expect(encrypted).not.toBe(plain);
      expect(encrypted).toContain(":"); // IV:tag:ciphertext format
      const decrypted = decryptTotpSecret(encrypted);
      expect(decrypted).toBe(plain);
    });

    it("produces different ciphertexts for the same plaintext (random IV)", () => {
      const plain = "JBSWY3DPEHPK3PXP";
      const e1 = encryptTotpSecret(plain);
      const e2 = encryptTotpSecret(plain);
      expect(e1).not.toBe(e2);
      // Both decrypt to the same value.
      expect(decryptTotpSecret(e1)).toBe(plain);
      expect(decryptTotpSecret(e2)).toBe(plain);
    });
  });

  describe("buildTotpUri", () => {
    it("builds a valid otpauth:// URI", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const uri = buildTotpUri({ secret, label: "alice", issuer: "Athena" });
      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("Athena");
      expect(uri).toContain("alice");
      expect(uri).toContain(`secret=${secret}`);
    });

    it("uses default issuer when not specified", () => {
      const uri = buildTotpUri({ secret: "JBSWY3DPEHPK3PXP", label: "bob" });
      expect(uri).toContain("Athena");
    });
  });

  describe("verifyTotpPlain", () => {
    it("accepts a valid code generated from the same secret", () => {
      const secret = generateTotpSecret();
      const code = authenticator.generate(secret);
      expect(verifyTotpPlain(secret, code)).toBe(true);
    });

    it("rejects an invalid code", () => {
      const secret = generateTotpSecret();
      expect(verifyTotpPlain(secret, "000000")).toBe(false);
    });

    it("rejects a code from a different secret", () => {
      const s1 = generateTotpSecret();
      const s2 = generateTotpSecret();
      const code = authenticator.generate(s1);
      expect(verifyTotpPlain(s2, code)).toBe(false);
    });
  });

  describe("verifyTotp (encrypted)", () => {
    it("accepts a valid code with an encrypted secret", () => {
      const plain = generateTotpSecret();
      const enc = encryptTotpSecret(plain);
      const code = authenticator.generate(plain);
      expect(verifyTotp(enc, code)).toBe(true);
    });

    it("rejects an invalid code with an encrypted secret", () => {
      const plain = generateTotpSecret();
      const enc = encryptTotpSecret(plain);
      expect(verifyTotp(enc, "000000")).toBe(false);
    });

    it("returns false for corrupted encrypted data (not throw)", () => {
      expect(verifyTotp("garbage:not-valid:hex", "123456")).toBe(false);
    });
  });
});

/**
 * 2FA (TOTP) service — generates secrets, verifies codes, and produces
 * otpauth:// URIs for QR code generation.
 *
 * Uses otplib for TOTP code generation/verification (RFC 6238).
 * Secrets are AES-256-GCM encrypted at rest via services/crypto.ts.
 */

import { authenticator } from "otplib";
import { encryptSecret, decryptSecret } from "./crypto";

// Configure otplib for standard TOTP parameters (30s window, 6 digits).
authenticator.options = {
  step: 30,
  window: 1, // accept 1 step before/after to account for clock drift
};

/**
 * Generate a new TOTP secret (base32-encoded).
 * Returns the plaintext secret — caller should encrypt it before storing.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Encrypt a TOTP secret for storage in the database.
 */
export function encryptTotpSecret(plain: string): string {
  return encryptSecret(plain);
}

/**
 * Decrypt a stored TOTP secret.
 */
export function decryptTotpSecret(encStr: string): string {
  return decryptSecret(encStr);
}

/**
 * Build the otpauth:// URI for QR code generation.
 * Authenticator apps scan this to add the account.
 */
export function buildTotpUri(opts: {
  secret: string;
  label: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer ?? "Mavino";
  return authenticator.keyuri(opts.label, issuer, opts.secret);
}

/**
 * Verify a TOTP code against a secret.
 * @param encSecret - the encrypted secret from the database
 * @param token - the 6-digit code from the user's authenticator app
 * @returns true if the code is valid
 */
export function verifyTotp(encSecret: string, token: string): boolean {
  try {
    const secret = decryptTotpSecret(encSecret);
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Verify a TOTP code against a plaintext secret (used during setup before
 * the secret is stored in the database).
 */
export function verifyTotpPlain(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}

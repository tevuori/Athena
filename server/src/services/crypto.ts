import * as crypto from "crypto";

// ===== Shared encryption helpers (AES-256-GCM) =====
// Key is derived from JWT_SECRET so rotating it invalidates stored secrets
// (same caveat as VUT credentials).

const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET ?? "athena-dev-secret-change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(encStr: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, dataHex] = encStr.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid encrypted data");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

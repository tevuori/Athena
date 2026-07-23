// ===== Ntfy config (DB-backed, per-user, encrypted token) =====

import crypto from "node:crypto";
import prisma from "../../db/client";
import { encryptSecret, decryptSecret } from "../crypto";
import {
  type NtfyUsableConfig,
  normalizeServerUrl,
  isValidTopic,
} from "./client";

const SERVER_FALLBACK_URL = process.env.NTFY_SERVER_URL?.trim() || "https://ntfy.sh";
const SERVER_FALLBACK_TOKEN = process.env.NTFY_TOKEN?.trim() || "";

/** Generate a random unguessable topic suffix (ntfy.sh topics are public). */
export function randomTopic(prefix = "athena"): string {
  const rand = crypto.randomBytes(9).toString("base64url").slice(0, 12);
  return `${prefix}-${rand}`;
}

/** Load + decrypt a user's NtfyConfig into a usable form. Returns null if none. */
export async function decryptNtfyConfig(userId: string): Promise<NtfyUsableConfig | null> {
  const row = await prisma.ntfyConfig.findUnique({ where: { userId } });
  if (!row) return null;
  let token = "";
  if (row.tokenEnc) {
    try {
      token = decryptSecret(row.tokenEnc);
    } catch {
      token = "";
    }
  }
  return {
    serverUrl: normalizeServerUrl(row.serverUrl || SERVER_FALLBACK_URL),
    token,
    notifyTopic: row.notifyTopic,
    inboxTopic: row.inboxTopic,
    defaultPriority: row.defaultPriority ?? 3,
  };
}

/** Public status (no token) for the client. */
export async function ntfyStatus(userId: string): Promise<{
  configured: boolean;
  enabled: boolean;
  serverUrl: string;
  notifyTopic: string;
  inboxTopic: string;
  defaultPriority: number;
}> {
  const row = await prisma.ntfyConfig.findUnique({ where: { userId } });
  if (!row) {
    return {
      configured: false,
      enabled: false,
      serverUrl: SERVER_FALLBACK_URL,
      notifyTopic: "",
      inboxTopic: "",
      defaultPriority: 3,
    };
  }
  return {
    configured: true,
    enabled: row.enabled,
    serverUrl: row.serverUrl,
    notifyTopic: row.notifyTopic,
    inboxTopic: row.inboxTopic,
    defaultPriority: row.defaultPriority ?? 3,
  };
}

export interface SaveNtfyConfigInput {
  serverUrl?: string;
  token?: string; // plaintext; "" clears
  notifyTopic?: string;
  inboxTopic?: string;
  enabled?: boolean;
  defaultPriority?: number;
}

/** Upsert a user's NtfyConfig. Auto-generates topics if missing/invalid.
 *  Returns the public status. */
export async function saveNtfyConfig(
  userId: string,
  input: SaveNtfyConfigInput
): Promise<{ configured: boolean; enabled: boolean; serverUrl: string; notifyTopic: string; inboxTopic: string; defaultPriority: number }> {
  const existing = await prisma.ntfyConfig.findUnique({ where: { userId } });

  const serverUrl = normalizeServerUrl(input.serverUrl ?? existing?.serverUrl ?? SERVER_FALLBACK_URL);
  let notifyTopic = (input.notifyTopic ?? existing?.notifyTopic ?? "").trim();
  let inboxTopic = (input.inboxTopic ?? existing?.inboxTopic ?? "").trim();
  if (!isValidTopic(notifyTopic)) notifyTopic = randomTopic("athena-notify");
  if (!isValidTopic(inboxTopic)) inboxTopic = randomTopic("athena-inbox");

  const enabled = input.enabled ?? existing?.enabled ?? true;
  const defaultPriority = input.defaultPriority ?? existing?.defaultPriority ?? 3;

  // Token: only re-encrypt if a new value is provided. "" clears it.
  let tokenEnc = existing?.tokenEnc ?? "";
  if (input.token !== undefined) {
    tokenEnc = input.token.trim() ? encryptSecret(input.token.trim()) : "";
  }

  const row = await prisma.ntfyConfig.upsert({
    where: { userId },
    create: { userId, serverUrl, tokenEnc, notifyTopic, inboxTopic, enabled, defaultPriority },
    update: { serverUrl, tokenEnc, notifyTopic, inboxTopic, enabled, defaultPriority },
  });

  return {
    configured: true,
    enabled: row.enabled,
    serverUrl: row.serverUrl,
    notifyTopic: row.notifyTopic,
    inboxTopic: row.inboxTopic,
    defaultPriority: row.defaultPriority ?? 3,
  };
}

export async function deleteNtfyConfig(userId: string): Promise<void> {
  await prisma.ntfyConfig.deleteMany({ where: { userId } });
}

/** Whether the user has ntfy enabled (subscriber/scheduler gate). */
export async function isNtfyEnabled(userId: string): Promise<boolean> {
  const row = await prisma.ntfyConfig.findUnique({ where: { userId } });
  return Boolean(row?.enabled);
}

// ===== Ntfy inbox subscriber manager =====
// One persistent long-poll subscriber per user (with ntfy enabled). Listens
// on the user's inbox topic; each inbound message triggers an Athena LLM
// turn (with tools) and the reply is published to the notify topic.
//
// Subscribers are started on boot and kept in sync with config changes via
// restartSubscriberFor(userId) / stopSubscriberFor(userId).

import prisma from "../../db/client";
import { decryptNtfyConfig, isNtfyEnabled } from "./config";
import { publish, subscribeStream, type NtfyMessage, type NtfyUsableConfig } from "./client";
import { runAthenaTurn } from "./athena-turn";

const MAX_REPLY_LEN = 4000;
const CURSOR_KEY = "ntfy_inbox_cursor";

const subscribers = new Map<string, { stop: () => void }>();
let bootStarted = false;

/** Persist the last-seen inbox message id so we don't replay history on restart. */
async function getCursor(userId: string): Promise<string> {
  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key: CURSOR_KEY } },
  });
  return row?.value || "all";
}

async function setCursor(userId: string, id: string): Promise<void> {
  await prisma.setting.upsert({
    where: { userId_key: { userId, key: CURSOR_KEY } },
    create: { userId, key: CURSOR_KEY, value: id },
    update: { value: id },
  });
}

async function handleInbound(userId: string, msg: NtfyMessage, cfg: NtfyUsableConfig): Promise<void> {
  const text = msg.message?.trim();
  if (!text) return;

  // Log inbound.
  await prisma.ntfyMessage.create({
    data: {
      userId,
      direction: "in",
      topic: cfg.inboxTopic,
      title: msg.title || "",
      body: text,
      priority: msg.priority ?? cfg.defaultPriority,
      tags: msg.tags || "",
    },
  });

  let reply: string;
  try {
    reply = (await runAthenaTurn(userId, text)) ?? "[Athena is not configured with an AI provider.]";
  } catch (e) {
    reply = `[Athena error: ${e instanceof Error ? e.message : "unknown"}]`;
  }
  reply = reply.slice(0, MAX_REPLY_LEN);

  try {
    await publish(cfg, {
      topic: cfg.notifyTopic,
      title: "Athena",
      body: reply,
      priority: cfg.defaultPriority,
    });
    await prisma.ntfyMessage.create({
      data: {
        userId,
        direction: "out",
        topic: cfg.notifyTopic,
        title: "Athena",
        body: reply,
        priority: cfg.defaultPriority,
      },
    });
  } catch (e) {
    console.error(`[ntfy] reply publish failed (user ${userId}):`, e instanceof Error ? e.message : e);
  }
}

/** Start (or restart) the subscriber for a single user. */
export async function startSubscriberFor(userId: string): Promise<void> {
  // Stop any existing subscriber for this user.
  stopSubscriberFor(userId);

  const enabled = await isNtfyEnabled(userId);
  if (!enabled) return;
  const cfg = await decryptNtfyConfig(userId);
  if (!cfg) return;

  const cursor = await getCursor(userId);

  const handle = subscribeStream(
    cfg,
    cfg.inboxTopic,
    cursor,
    async (msg) => {
      // Advance cursor immediately.
      await setCursor(userId, msg.id).catch(() => {});
      await handleInbound(userId, msg, cfg).catch((e) => {
        console.error(`[ntfy] inbound handler error (user ${userId}):`, e instanceof Error ? e.message : e);
      });
    },
    (err) => {
      console.warn(`[ntfy] subscriber error (user ${userId}):`, err.message);
    }
  );

  subscribers.set(userId, handle);
}

export function stopSubscriberFor(userId: string): void {
  const handle = subscribers.get(userId);
  if (handle) {
    try {
      handle.stop();
    } catch {
      /* ignore */
    }
    subscribers.delete(userId);
  }
}

/** Restart a user's subscriber after a config change. */
export async function restartSubscriberFor(userId: string): Promise<void> {
  await startSubscriberFor(userId);
}

/** Start subscribers for all enabled users (called on boot). */
export async function startAllSubscribers(): Promise<void> {
  if (bootStarted) return;
  bootStarted = true;
  const configs = await prisma.ntfyConfig.findMany({
    where: { enabled: true },
    select: { userId: true },
  });
  for (const c of configs) {
    startSubscriberFor(c.userId).catch((e) =>
      console.error(`[ntfy] failed to start subscriber for ${c.userId}:`, e instanceof Error ? e.message : e)
    );
  }
}

export function stopAllSubscribers(): void {
  for (const [, handle] of subscribers) {
    try {
      handle.stop();
    } catch {
      /* ignore */
    }
  }
  subscribers.clear();
}

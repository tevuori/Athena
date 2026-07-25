// ===== Reminder scheduler =====
// A 30-second tick that fires due Reminder rows (one-shot, ntfy-delivered).
//   - type="basic": publishes the fixed `message` to the notify topic (no LLM).
//   - type="athena": runs an Athena LLM turn (with tools) using `prompt` and
//     publishes the generated reply — so the reminder can gather context at
//     fire time (calendar, tasks, exam details) and be tailored.
// After firing, the row is marked fired=true (kept for history; never refires).
// Skips gracefully if ntfy isn't configured (marks fired to avoid a stuck loop).

import prisma from "../../db/client";
import { decryptNtfyConfig } from "../ntfy/config";
import { publish, type NtfyUsableConfig } from "../ntfy/client";
import { runAthenaTurn } from "../ntfy/athena-turn";

const TICK_MS = 30_000;
const MAX_BODY_LEN = 4000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function fireReminder(reminder: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  prompt: string;
  priority: number;
  tags: string;
}): Promise<void> {
  const cfg: NtfyUsableConfig | null = await decryptNtfyConfig(reminder.userId);
  if (!cfg) {
    // No ntfy config — mark fired so we don't loop on it forever.
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { fired: true, firedAt: new Date() },
    });
    console.warn(
      `[reminders] reminder ${reminder.id} skipped — ntfy not configured for user ${reminder.userId}`
    );
    return;
  }

  let body = "";
  const title = reminder.title || "Athena reminder";

  if (reminder.type === "athena") {
    try {
      body =
        (await runAthenaTurn(reminder.userId, reminder.prompt || reminder.title || "Remind the user." )) ??
        "[Athena is not configured with an AI provider — cannot generate a contextual reminder.]";
    } catch (e) {
      body = `[Athena reminder error: ${e instanceof Error ? e.message : "unknown"}]`;
    }
  } else {
    body = reminder.message || reminder.title || "Reminder";
  }

  body = body.slice(0, MAX_BODY_LEN);

  try {
    await publish(cfg, {
      topic: cfg.notifyTopic,
      title,
      body,
      priority: reminder.priority || cfg.defaultPriority,
      tags: reminder.tags || "bell",
    });
    await prisma.ntfyMessage.create({
      data: {
        userId: reminder.userId,
        direction: "reminder",
        topic: cfg.notifyTopic,
        title,
        body,
        priority: reminder.priority || cfg.defaultPriority,
        tags: reminder.tags || "bell",
      },
    });
  } catch (e) {
    console.error(
      `[reminders] publish failed (reminder ${reminder.id}):`,
      e instanceof Error ? e.message : e
    );
    // Don't mark fired on publish failure — retry on the next tick.
    return;
  }

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { fired: true, firedAt: new Date() },
  });
}

async function tick(): Promise<void> {
  if (running) return; // guard against overlap
  running = true;
  try {
    const now = new Date();
    const due = await prisma.reminder.findMany({
      where: { fired: false, cancelled: false, fireAt: { lte: now } },
      take: 100,
      orderBy: { fireAt: "asc" },
    });
    for (const reminder of due) {
      try {
        await fireReminder(reminder);
      } catch (e) {
        console.error(
          `[reminders] fire error (reminder ${reminder.id}):`,
          e instanceof Error ? e.message : e
        );
      }
    }
  } finally {
    running = false;
  }
}

/** Start the scheduler (idempotent). */
export function startReminderScheduler(): void {
  if (timer) return;
  // Fire shortly after boot, then every 30s.
  setTimeout(
    () => tick().catch((e) => console.error("[reminders] scheduler tick error:", e)),
    5000
  );
  timer = setInterval(
    () => tick().catch((e) => console.error("[reminders] scheduler tick error:", e)),
    TICK_MS
  );
}

export function stopReminderScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

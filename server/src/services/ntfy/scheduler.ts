// ===== Ntfy cron scheduler =====
// A 60-second tick that fires due NtfyCronJob rows.
//   - type="notification": publishes a fixed message to the notify topic.
//   - type="athena": runs an Athena LLM turn (with tools) and publishes the
//     generated reply to the notify topic.
// After firing, nextRunAt is recomputed via croner.

import { Cron } from "croner";
import prisma from "../../db/client";
import { decryptNtfyConfig } from "./config";
import { publish, type NtfyUsableConfig } from "./client";
import { runAthenaTurn } from "./athena-turn";

const TICK_MS = 60_000;
const MAX_BODY_LEN = 4000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Validate a 5-field cron expression; returns true if valid. */
export function isValidCron(expr: string): boolean {
  try {
    const c = new Cron(expr);
    return c.nextRun() !== null;
  } catch {
    return false;
  }
}

/** Compute the next run time for a cron expression from a given date. */
export function nextRunAt(expr: string, from: Date = new Date()): Date {
  const c = new Cron(expr);
  const next = c.nextRun(from);
  return next ?? new Date(Date.now() + 86400000);
}

async function fireJob(job: {
  id: string;
  userId: string;
  name: string;
  cron: string;
  type: string;
  message: string;
  prompt: string;
  title: string;
  priority: number;
  tags: string;
}): Promise<void> {
  const cfg: NtfyUsableConfig | null = await decryptNtfyConfig(job.userId);
  if (!cfg) {
    // No ntfy config — disable the job so it stops firing.
    await prisma.ntfyCronJob.update({
      where: { id: job.id },
      data: { enabled: false },
    });
    return;
  }

  let body = "";
  let title = job.title || "Athena";

  if (job.type === "athena") {
    try {
      const reply = await runAthenaTurn(job.userId, job.prompt || job.name);
      body = reply ?? "[Athena is not configured with an AI provider — cannot generate a response.]";
    } catch (e) {
      body = `[Athena cron error: ${e instanceof Error ? e.message : "unknown"}]`;
    }
  } else {
    body = job.message || job.name;
  }

  body = body.slice(0, MAX_BODY_LEN);

  try {
    await publish(cfg, {
      topic: cfg.notifyTopic,
      title,
      body,
      priority: job.priority || cfg.defaultPriority,
      tags: job.tags || undefined,
    });
    await prisma.ntfyMessage.create({
      data: {
        userId: job.userId,
        direction: "cron",
        topic: cfg.notifyTopic,
        title,
        body,
        priority: job.priority || cfg.defaultPriority,
        tags: job.tags || "",
        cronJobId: job.id,
      },
    });
  } catch (e) {
    console.error(`[ntfy] cron publish failed (job ${job.id}):`, e instanceof Error ? e.message : e);
  }
}

async function tick(): Promise<void> {
  if (running) return; // guard against overlap
  running = true;
  try {
    const now = new Date();
    const due = await prisma.ntfyCronJob.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      take: 100,
    });
    for (const job of due) {
      try {
        await fireJob(job);
      } catch (e) {
        console.error(`[ntfy] cron fire error (job ${job.id}):`, e instanceof Error ? e.message : e);
      }
      // Reschedule (or disable if the expression became invalid).
      let next: Date;
      try {
        next = nextRunAt(job.cron, new Date());
      } catch {
        next = new Date(Date.now() + 86400000);
        await prisma.ntfyCronJob.update({
          where: { id: job.id },
          data: { enabled: false, lastRunAt: new Date(), nextRunAt: next },
        });
        continue;
      }
      await prisma.ntfyCronJob.update({
        where: { id: job.id },
        data: { lastRunAt: new Date(), nextRunAt: next },
      });
    }
  } finally {
    running = false;
  }
}

/** Start the scheduler (idempotent). */
export function startScheduler(): void {
  if (timer) return;
  // Fire shortly after boot, then every 60s.
  setTimeout(() => tick().catch((e) => console.error("[ntfy] scheduler tick error:", e)), 5000);
  timer = setInterval(() => tick().catch((e) => console.error("[ntfy] scheduler tick error:", e)), TICK_MS);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

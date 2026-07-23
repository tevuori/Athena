// ===== Proactive alerts scheduler =====
// A 60-second tick that fires due ProactiveAlertConfig rows. For each due
// user, runs an Athena LLM turn (with tools) that gathers context from the
// workspace (calendar, tasks, habits, due flashcards) and publishes a concise
// daily briefing to the user's ntfy notify topic. After firing, nextRunAt is
// recomputed to the next occurrence of the configured hour:minute.
//
// Requires both ntfy (publish channel) and an LLM provider to be configured;
// otherwise the tick skips the user and reschedules without firing.

import prisma from "../../db/client";
import { decryptNtfyConfig, isNtfyEnabled } from "./config";
import { publish, type NtfyUsableConfig } from "./client";
import { runAthenaTurn, isAthenaReady } from "./athena-turn";

const TICK_MS = 60_000;
const MAX_BODY_LEN = 4000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Compute the next occurrence of hour:minute after `from` (defaults to now). */
export function computeNextRunAt(hour: number, minute: number, from: Date = new Date()): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** Sanitize/normalize a comma-separated category list against the known set. */
export function normalizeCategories(raw: string): string[] {
  const known = ["calendar", "tasks", "flashcards", "habits"];
  const parts = (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => known.includes(s));
  return parts.length ? Array.from(new Set(parts)) : known;
}

/** Build the proactive briefing prompt from the enabled categories. */
export function buildProactivePrompt(categories: string[], customPrompt: string): string {
  if (customPrompt.trim()) return customPrompt.trim();

  const lines: string[] = [
    "This is your proactive daily check-in. Use your tools to review the user's workspace and give a concise, friendly briefing (max ~150 words).",
  ];
  if (categories.includes("calendar")) {
    lines.push(
      "- Calendar: call list_calendar_events for today and tomorrow to surface upcoming classes, exams, or appointments."
    );
  }
  if (categories.includes("tasks")) {
    lines.push(
      "- Tasks: call list_tasks for open tasks, highlighting any due today or tomorrow."
    );
  }
  if (categories.includes("flashcards")) {
    lines.push(
      "- Flashcards: the workspace summary already shows how many cards are due for review — mention the count and suggest a review session if any are due."
    );
  }
  if (categories.includes("habits")) {
    lines.push(
      "- Habits: call list_habits to check streaks and which daily habits haven't been completed yet today."
    );
  }
  lines.push(
    "Even if there is nothing urgent or due, still send a brief encouraging message so the user knows the channel is alive. End with one concrete suggestion for the day. Do not use tool calls that open windows or create items unless asked — this is a read-only briefing."
  );
  return lines.join("\n");
}

async function fireAlert(cfg: {
  id: string;
  userId: string;
  categories: string;
  customPrompt: string;
}): Promise<string> {
  // Both ntfy and an LLM provider must be configured.
  const [ntfyReady, athenaReady] = await Promise.all([
    isNtfyEnabled(cfg.userId),
    isAthenaReady(cfg.userId),
  ]);
  if (!ntfyReady || !athenaReady) {
    return "[Proactive alert skipped — ntfy or Athena LLM not configured.]";
  }

  const ntfyCfg: NtfyUsableConfig | null = await decryptNtfyConfig(cfg.userId);
  if (!ntfyCfg) {
    return "[Proactive alert skipped — ntfy config missing.]";
  }

  const categories = normalizeCategories(cfg.categories);
  const prompt = buildProactivePrompt(categories, cfg.customPrompt);

  let body = "";
  try {
    const reply = await runAthenaTurn(cfg.userId, prompt);
    body = reply ?? "[Athena is not configured with an AI provider — cannot generate a briefing.]";
  } catch (e) {
    body = `[Proactive alert error: ${e instanceof Error ? e.message : "unknown"}]`;
  }

  body = body.slice(0, MAX_BODY_LEN);
  const title = "Athena daily briefing";

  try {
    await publish(ntfyCfg, {
      topic: ntfyCfg.notifyTopic,
      title,
      body,
      priority: ntfyCfg.defaultPriority,
      tags: "bell",
    });
    await prisma.ntfyMessage.create({
      data: {
        userId: cfg.userId,
        direction: "proactive",
        topic: ntfyCfg.notifyTopic,
        title,
        body,
        priority: ntfyCfg.defaultPriority,
        tags: "bell",
      },
    });
  } catch (e) {
    console.error(
      `[proactive] publish failed (user ${cfg.userId}):`,
      e instanceof Error ? e.message : e
    );
  }
  return body;
}

async function tick(): Promise<void> {
  if (running) return; // guard against overlap
  running = true;
  try {
    const now = new Date();
    const due = await prisma.proactiveAlertConfig.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      take: 100,
    });
    for (const cfg of due) {
      try {
        await fireAlert(cfg);
      } catch (e) {
        console.error(
          `[proactive] fire error (user ${cfg.userId}):`,
          e instanceof Error ? e.message : e
        );
      }
      // Reschedule to the next occurrence of the configured time.
      const next = computeNextRunAt(cfg.hour, cfg.minute, new Date());
      await prisma.proactiveAlertConfig.update({
        where: { id: cfg.id },
        data: { lastRunAt: new Date(), nextRunAt: next },
      });
    }
  } finally {
    running = false;
  }
}

/** Start the scheduler (idempotent). */
export function startProactiveScheduler(): void {
  if (timer) return;
  setTimeout(
    () => tick().catch((e) => console.error("[proactive] scheduler tick error:", e)),
    5000
  );
  timer = setInterval(
    () => tick().catch((e) => console.error("[proactive] scheduler tick error:", e)),
    TICK_MS
  );
}

export function stopProactiveScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Fire a one-off alert immediately (used by the "test" endpoint). Returns the generated body. */
export async function runProactiveAlertNow(userId: string): Promise<string> {
  const cfg = await prisma.proactiveAlertConfig.findUnique({ where: { userId } });
  if (!cfg) {
    return "[No proactive alert config — enable proactive alerts first.]";
  }
  return fireAlert({
    id: cfg.id,
    userId: cfg.userId,
    categories: cfg.categories,
    customPrompt: cfg.customPrompt,
  });
}

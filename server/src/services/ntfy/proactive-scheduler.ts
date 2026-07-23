// ===== Proactive alerts scheduler =====
// A 60-second tick that fires due ProactiveAlertConfig rows. For each due
// user, runs an Athena LLM turn (with tools) that gathers context from the
// workspace (calendar, tasks, habits, due flashcards) and publishes a concise
// daily briefing to the user's ntfy notify topic. After firing, nextRunAt is
// recomputed to the next occurrence of the configured hour:minute.
//
// Requires both ntfy (publish channel) and an LLM provider to be configured;
// otherwise the tick skips the user and reschedules without firing.

import { Message } from "multi-llm-ts";
import prisma from "../../db/client";
import { decryptNtfyConfig, isNtfyEnabled } from "./config";
import { publish, type NtfyUsableConfig } from "./client";
import { isAthenaReady } from "./athena-turn";
import { buildModel, getUserConfig } from "../athena/llm";
import { buildSystemPrompt } from "../athena/context";
import { AthenaToolsPlugin, ALL_TOOLS } from "../athena/tools";

const TICK_MS = 60_000;
const MAX_BODY_LEN = 4000;
// Proactive alerts are non-interactive, so we can afford aggressive retries.
const TURN_RETRIES = 3; // retry the entire generation this many times
const FETCH_RETRIES = 8; // per-fetch retries within a turn
const RETRY_BASE_MS = 3000; // base backoff for fetch retries

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run a proactive Athena turn with aggressive retry logic. Unlike
 * runAthenaTurn (designed for interactive chat, gives up fast), this is
 * non-interactive and can afford to retry heavily — the free OpenCode Zen
 * endpoint frequently drops connections mid-generation.
 *
 * Handles:
 *   - Network-level errors (fetch throws TypeError on connection drop)
 *   - HTTP 5xx server errors
 *   - HTTP 400 "upstream request failed" (transient provider errors)
 *   - Top-level turn retries (re-run the entire generation if it fails)
 */
async function runProactiveTurn(userId: string, userText: string): Promise<string | null> {
  const cfg = await getUserConfig(userId);
  if (!cfg.apiKey) return null;

  const systemPrompt = await buildSystemPrompt(userId, []);

  for (let turnAttempt = 0; turnAttempt < TURN_RETRIES; turnAttempt++) {
    const thread: Message[] = [
      new Message("system", systemPrompt),
      new Message("user", userText),
    ];

    const model = buildModel(cfg);
    const plugin = new AthenaToolsPlugin(ALL_TOOLS, { userId, windows: [] });
    model.addPlugin(plugin);

    // Patch fetch with aggressive retry: catches network throws + 5xx + 400.
    const engine = (model as any).engine;
    const client = engine?.client;
    if (client && typeof client.fetch === "function") {
      const origFetch = client.fetch.bind(client);
      client.fetch = async (url: string, init?: any) => {
        for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
          try {
            const res = await origFetch(url, init);
            // Retry on 5xx or 400 "upstream request failed"
            if (res.status >= 500 || res.status === 400) {
              const shouldRetry = await shouldRetryResponse(res, attempt, FETCH_RETRIES);
              if (shouldRetry) continue;
            }
            return res;
          } catch (e) {
            // Network-level error (connection drop, DNS, timeout) — retry
            if (attempt < FETCH_RETRIES) {
              const base = Math.min(RETRY_BASE_MS * 2 ** attempt, 30000);
              const jitter = Math.floor(Math.random() * 1000);
              await sleep(base + jitter);
              continue;
            }
            throw e;
          }
        }
        return origFetch(url, init);
      };
    }

    let text = "";
    let completedTools = 0;
    let failedTools = 0;

    try {
      for await (const chunk of model.generate(thread, { tools: true })) {
        if (chunk.type === "content") {
          text += chunk.text ?? "";
        } else if (chunk.type === "tool" && chunk.state === "completed") {
          const result = chunk.call?.result as any;
          if (result && typeof result === "object" && "error" in result) {
            failedTools++;
          } else {
            completedTools++;
          }
        }
      }
      const result = text.trim();
      if (result) return result;
      // Empty text but no error — if tools ran, try once more to get a summary.
      if (turnAttempt < TURN_RETRIES - 1) {
        await sleep(5000);
        continue;
      }
      return "(no response)";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const isTransient = /upstream|timeout|fetch|network|connection|ECONN/i.test(msg);
      if (isTransient && turnAttempt < TURN_RETRIES - 1) {
        console.error(
          `[proactive] turn ${turnAttempt + 1}/${TURN_RETRIES} failed (${msg}), retrying...`
        );
        await sleep(8000 * (turnAttempt + 1));
        continue;
      }
      // Last attempt failed — return a honest error rather than a canned "I completed" message.
      if (completedTools > 0) {
        return (
          `I gathered your workspace context (${completedTools} tool call${completedTools > 1 ? "s" : ""} ` +
          `succeeded) but couldn't generate the final briefing — the AI provider was unavailable. ` +
          `Try again later or configure a more reliable provider in Settings → Athena Assistant.`
        );
      }
      throw e;
    }
  }
  return "(no response)";
}

/** Check if an HTTP error response is transient and should be retried. */
async function shouldRetryResponse(
  res: Response,
  attempt: number,
  maxRetries: number
): Promise<boolean> {
  if (attempt >= maxRetries) return false;
  if (res.status >= 500) return true; // 5xx always retry
  // 400: only retry if "upstream request failed"
  if (res.status === 400) {
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      const msg = (body as any)?.error?.message ?? (body as any)?.message ?? "";
      return /upstream request failed/i.test(msg);
    } catch {
      return false;
    }
  }
  return false;
}

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
    const reply = await runProactiveTurn(cfg.userId, prompt);
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

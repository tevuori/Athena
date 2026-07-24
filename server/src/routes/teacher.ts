// ===== Interactive Teacher ("Teach Me" mode) sessions =====
// Persisted, source-grounded live-tutoring sessions. The /:id/stream endpoint
// uses the teacher system prompt (with source-history + comprehension state)
// + the full Athena tool set (including the teacher show_source/highlight/
// scroll/comprehension tools) and streams content/tool/client_action SSE
// events — reusing the Athena chat streaming pattern.

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { Message } from "multi-llm-ts";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { acquireLlmModel, isLlmConfiguredFor, LlmError } from "../services/athena/llm";
import {
  AthenaToolsPlugin,
  ALL_TOOLS,
  CLIENT_ACTION_TOOLS,
  DESTRUCTIVE_TOOLS,
  type ClientWindowInfo,
} from "../services/athena/tools";
import { teacherSystemPrompt, type SourceHistoryEntry, type TeacherSessionState } from "../services/study/teacher-prompt";
import type { GroundedSource, StudyLanguage } from "../services/study/prompts";
import { logSessionSafe } from "../services/study/logSession";

const teacher = new Hono();
teacher.use("*", authMiddleware);

// ---------- helpers ----------

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  tools?: { id: string; name: string; state: string }[];
  timestamp: string;
}

function parseMessages(raw: string): StoredMessage[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseSourceIds(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseState(raw: string): TeacherSessionState {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Load the GroundedSource list (with cached text) for a session. */
async function loadSessionSources(userId: string, sourceIds: string[]): Promise<GroundedSource[]> {
  if (sourceIds.length === 0) return [];
  const rows = await prisma.studySource.findMany({ where: { id: { in: sourceIds }, userId } });
  return sourceIds
    .map((id, i) => {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      return {
        index: i + 1,
        name: r.name,
        kind: r.kind,
        refId: r.refId,
        text: r.textCache,
      } as GroundedSource;
    })
    .filter((x): x is GroundedSource => x !== null);
}

function serialize(s: any) {
  return {
    id: s.id,
    title: s.title,
    sourceIds: parseSourceIds(s.sourceIds),
    messages: parseMessages(s.messages),
    state: parseState(s.state),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    lastMessageAt: s.lastMessageAt.toISOString(),
  };
}

// ---------- CRUD ----------

const createSchema = z.object({
  title: z.string().max(200).optional(),
  sourceIds: z.array(z.string()).max(10).default([]),
  studentLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  sources: z
    .array(
      z.object({
        kind: z.enum(["note", "file", "paste", "moodle", "url"]),
        id: z.string().optional(),
        text: z.string().optional(),
        url: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .max(10)
    .optional(),
});

/** POST / — create a teacher session. Resolves + caches on-the-fly sources. */
teacher.post("/", zValidator("json", createSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");

  let sourceIds = [...body.sourceIds];
  if (body.sources && body.sources.length > 0) {
    const { resolveAndCache } = await import("../services/study/source");
    for (const src of body.sources) {
      try {
        const cached = await resolveAndCache(userId, src as any);
        if (!sourceIds.includes(cached.id)) sourceIds.push(cached.id);
      } catch {
        // skip sources that fail to resolve
      }
    }
  }

  let title = body.title?.trim();
  if (!title) {
    if (sourceIds.length > 0) {
      const first = await prisma.studySource.findFirst({
        where: { id: sourceIds[0], userId },
        select: { name: true },
      });
      title = first ? `Teach Me: ${first.name}` : "Teach Me session";
    } else {
      title = "Teach Me session";
    }
  }

  const state: TeacherSessionState = {
    studentLevel: body.studentLevel ?? "intermediate",
    sourceHistory: [],
    coveredConcepts: [],
    comprehensionLog: [],
  };

  const created = await prisma.teacherSession.create({
    data: {
      userId,
      title: title.slice(0, 200),
      sourceIds: JSON.stringify(sourceIds),
      messages: "[]",
      state: JSON.stringify(state),
    },
  });

  return c.json({ session: serialize(created) }, 201);
});

/** GET / — list sessions (no messages). */
teacher.get("/", async (c) => {
  const { userId } = c.get("auth");
  const rows = await prisma.teacherSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return c.json({ sessions: rows.map((r) => ({ ...serialize(r), messages: undefined })) });
});

/** GET /:id — full session incl. messages + state. */
teacher.get("/:id", async (c) => {
  const { userId } = c.get("auth");
  const row = await prisma.teacherSession.findFirst({ where: { id: c.req.param("id"), userId } });
  if (!row) return c.json({ error: "Session not found" }, 404);
  return c.json({ session: serialize(row) });
});

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  sourceIds: z.array(z.string()).max(10).optional(),
  state: z.any().optional(),
});

/** PATCH /:id — update title / sourceIds / state. */
teacher.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const row = await prisma.teacherSession.findFirst({ where: { id: c.req.param("id"), userId } });
  if (!row) return c.json({ error: "Session not found" }, 404);
  const data: any = {};
  if (body.title !== undefined) data.title = body.title.slice(0, 200);
  if (body.sourceIds !== undefined) data.sourceIds = JSON.stringify(body.sourceIds);
  if (body.state !== undefined) data.state = JSON.stringify(body.state);
  const updated = await prisma.teacherSession.update({ where: { id: row.id }, data });
  return c.json({ session: serialize(updated) });
});

/** DELETE /:id */
teacher.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const row = await prisma.teacherSession.findFirst({ where: { id: c.req.param("id"), userId } });
  if (!row) return c.json({ error: "Session not found" }, 404);
  await prisma.teacherSession.delete({ where: { id: row.id } });
  return c.json({ ok: true });
});

// ---------- Streaming teacher turn ----------

const streamSchema = z.object({
  message: z.string().min(1).max(20000),
  language: z.enum(["en", "cs"]).optional().default("en"),
  windows: z.array(z.any()).optional(),
  /** Updated source-history + state sent by the client after each turn. */
  sourceHistory: z.array(z.any()).optional(),
  state: z.any().optional(),
});

/** POST /:id/stream — stream a teacher turn with tools + client_action events.
 *  SSE events: content | tool | client_action | data_change | usage | done | error. */
teacher.post("/:id/stream", zValidator("json", streamSchema), async (c) => {
  const { userId } = c.get("auth");
  const sessionId = c.req.param("id");
  const body = c.req.valid("json");

  const row = await prisma.teacherSession.findFirst({ where: { id: sessionId, userId } });
  if (!row) return c.json({ error: "Session not found" }, 404);

  const configured = await isLlmConfiguredFor(userId);
  if (!configured) {
    return c.json({ error: "No AI provider configured. Add an API key in Settings → AI." }, 400);
  }

  const sourceIds = parseSourceIds(row.sourceIds);
  const sources = await loadSessionSources(userId, sourceIds);
  if (sources.length === 0) {
    return c.json({ error: "This session has no sources. Add at least one source first." }, 400);
  }

  // Use the client-sent source-history + state (kept in sync by the client
  // store) so Athena can resolve "go back to the first file" etc.
  const history: SourceHistoryEntry[] = Array.isArray(body.sourceHistory) ? body.sourceHistory : [];
  const state: TeacherSessionState = body.state ?? parseState(row.state);

  const { model } = await acquireLlmModel(userId);
  const systemPrompt = teacherSystemPrompt(sources, history, state, body.language as StudyLanguage);

  const history2 = parseMessages(row.messages);
  const thread: Message[] = [new Message("system", systemPrompt)];
  for (const m of history2) {
    const content = m.role === "assistant" ? m.content.replace(/\n*##\s*Sources[\s\S]*$/i, "").trim() : m.content;
    thread.push(new Message(m.role, content));
  }
  thread.push(new Message("user", body.message));

  // Persist the user message immediately.
  const userMsg: StoredMessage = { role: "user", content: body.message, timestamp: new Date().toISOString() };
  const updatedMessages = [...history2, userMsg];
  await prisma.teacherSession.update({
    where: { id: row.id },
    data: {
      messages: JSON.stringify(updatedMessages),
      lastMessageAt: new Date(),
      title: history2.length === 0 ? body.message.slice(0, 80) : row.title,
    },
  });

  const clientWindows: ClientWindowInfo[] = (body.windows ?? []) as ClientWindowInfo[];
  const abort = new AbortController();
  c.req.raw.signal?.addEventListener("abort", () => abort.abort());

  return streamSSE(c, async (stream) => {
    const plugin = new AthenaToolsPlugin(ALL_TOOLS, { userId, windows: clientWindows });
    model.addPlugin(plugin);

    let full = "";
    let errored = false;
    const toolEvents: { id: string; name: string; state: string }[] = [];
    try {
      for await (const chunk of model.generate(thread, { tools: true, abortSignal: abort.signal })) {
        if (chunk.type === "content") {
          full += chunk.text ?? "";
          await stream.writeSSE({
            event: "content",
            data: JSON.stringify({ text: chunk.text ?? "", done: chunk.done }),
          });
        } else if (chunk.type === "tool") {
          await stream.writeSSE({
            event: "tool",
            data: JSON.stringify({
              id: chunk.id,
              name: chunk.name,
              state: chunk.state,
              status: chunk.status ?? "",
              result: chunk.state === "completed" ? chunk.call?.result : undefined,
            }),
          });
          if (chunk.state === "completed") {
            toolEvents.push({ id: chunk.id, name: chunk.name, state: chunk.state });
            const result = chunk.call?.result as any;
            if (DESTRUCTIVE_TOOLS.has(chunk.name) && result && !result?.error) {
              await stream.writeSSE({ event: "data_change", data: JSON.stringify({ tool: chunk.name }) });
            }
            if (CLIENT_ACTION_TOOLS.has(chunk.name) && result && !result?.error) {
              await stream.writeSSE({
                event: "client_action",
                data: JSON.stringify({ tool: chunk.name, payload: result }),
              });
            }
          }
        } else if (chunk.type === "usage") {
          await stream.writeSSE({ event: "usage", data: JSON.stringify({ usage: chunk.usage }) });
        }
      }
    } catch (e) {
      errored = true;
      const msg = e instanceof Error ? e.message : "Generation failed";
      const status = e instanceof LlmError ? e.status : 500;
      await stream.writeSSE({ event: "error", data: JSON.stringify({ error: msg, status }) });
      if (!full.trim()) return;
    }

    // Persist the assistant message.
    const assistantMsg: StoredMessage = {
      role: "assistant",
      content: full.trim(),
      tools: toolEvents.length > 0 ? toolEvents : undefined,
      timestamp: new Date().toISOString(),
    };
    const prior = parseMessages(
      (await prisma.teacherSession.findFirst({ where: { id: row.id }, select: { messages: true } }))?.messages ?? "[]"
    );
    // Persist the updated state (source-history + comprehension log) sent by
    // the client so resumption restores the full session context.
    const stateToPersist: TeacherSessionState = body.state ?? state;
    await prisma.teacherSession.update({
      where: { id: row.id },
      data: {
        messages: JSON.stringify([...prior, assistantMsg]),
        lastMessageAt: new Date(),
        state: JSON.stringify(stateToPersist),
      },
    });

    await logSessionSafe(userId, "teach", row.title, sourceIds.join(","), {
      sessionId: row.id,
      tools: toolEvents.length,
    });

    if (!errored) {
      await stream.writeSSE({ event: "done", data: JSON.stringify({ done: true }) });
    }
  });
});

export default teacher;

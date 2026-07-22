import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { Message } from "multi-llm-ts";
import { authMiddleware } from "../middleware/auth";
import { buildModel, getUserConfig, LlmError } from "../services/athena/llm";
import { buildSystemPrompt } from "../services/athena/context";
import {
  AthenaToolsPlugin,
  ALL_TOOLS,
  CLIENT_ACTION_TOOLS,
  toolManifest,
  type ClientWindowInfo,
} from "../services/athena/tools";

const athena = new Hono();
athena.use("*", authMiddleware);

/** GET /api/athena/tools — list available tools (for client UI). */
athena.get("/tools", (c) => c.json({ tools: toolManifest() }));

const windowSchema = z.object({
  id: z.string(),
  appId: z.string(),
  title: z.string(),
  rect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  minimized: z.boolean().default(false),
  focused: z.boolean().default(false),
});

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20000),
      })
    )
    .min(1)
    .max(50),
  /** Current open windows on the client (for window management tools + context). */
  windows: z.array(windowSchema).default([]),
});

/**
 * POST /api/athena/chat — streaming agent turn.
 * Emits SSE events: content | tool | client_action | usage | error | done.
 * The client reads this with fetch + ReadableStream (EventSource can't POST).
 */
athena.post("/chat", zValidator("json", chatSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");

  const cfg = await getUserConfig(userId);
  if (!cfg.apiKey) {
    return c.json(
      { error: "No AI provider configured. Add an API key in Settings → AI." },
      400
    );
  }

  const clientWindows: ClientWindowInfo[] = body.windows ?? [];
  const systemPrompt = await buildSystemPrompt(userId, clientWindows);
  // Use Message instances (multi-llm-ts expects them for vision checks etc.)
  // but override toJSON so only { role, content } is serialized to the provider.
  // Extra fields (attachments, toolCalls, contentForModel, reasoning) cause 400
  // errors on some OpenAI-compatible endpoints (e.g. OpenCode Zen / DeepSeek).
  const thread: Message[] = [
    new Message("system", systemPrompt),
    ...body.messages.map((m) => new Message(m.role as "user" | "assistant", m.content)),
  ];
  // Patch toJSON on each Message so the OpenAI SDK serializes clean API format.
  for (const msg of thread) {
    (msg as any).toJSON = function () {
      return { role: this.role, content: this.content };
    };
  }

  // Abort when the client disconnects.
  const abort = new AbortController();
  c.req.raw.signal?.addEventListener("abort", () => abort.abort());

  return streamSSE(
    c,
    async (stream) => {
      const model = buildModel(cfg);
      const plugin = new AthenaToolsPlugin(ALL_TOOLS, {
        userId,
        windows: clientWindows,
      });
      model.addPlugin(plugin);

      try {
        for await (const chunk of model.generate(thread, {
          tools: true,
          abortSignal: abort.signal,
        })) {
          if (chunk.type === "content") {
            await stream.writeSSE({
              event: "content",
              data: JSON.stringify({ text: chunk.text ?? "", done: chunk.done }),
            });
          } else if (chunk.type === "reasoning") {
            await stream.writeSSE({
              event: "reasoning",
              data: JSON.stringify({ text: chunk.text ?? "" }),
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
            if (
              chunk.state === "completed" &&
              CLIENT_ACTION_TOOLS.has(chunk.name) &&
              chunk.call?.result
            ) {
              await stream.writeSSE({
                event: "client_action",
                data: JSON.stringify({
                  tool: chunk.name,
                  payload: chunk.call.result,
                }),
              });
            }
          } else if (chunk.type === "usage") {
            await stream.writeSSE({
              event: "usage",
              data: JSON.stringify({ usage: chunk.usage }),
            });
          }
        }
        await stream.writeSSE({ event: "done", data: "{}" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Athena request failed";
        const status = e instanceof LlmError ? e.status : 500;
        console.error("[athena] chat error:", msg, e instanceof Error ? e.stack : e);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: msg, status }),
        });
      }
    },
    (err, stream) =>
      stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: err.message }),
      })
  );
});

export default athena;

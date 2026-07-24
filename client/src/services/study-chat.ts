// ===== Study Hub: source-grounded Q&A API client =====
// CRUD for persisted StudyChats + SSE streaming for grounded answers. Mirrors
// the Athena chat SSE client (fetch + ReadableStream, since EventSource can't
// POST with an Authorization header).

import { apiUrl, getToken, api } from "./api";
import type { SourceDescriptor } from "./study";

export interface ChatCitation {
  index: number;
  name: string;
  kind: string;
  refId: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  timestamp: string;
}

export interface StudyChat {
  id: string;
  title: string;
  sourceIds: string[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface StudyChatSummary {
  id: string;
  title: string;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface StreamCallbacks {
  onContent?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export interface StreamHandle {
  abort: () => void;
  done: Promise<void>;
}

export const studyChatApi = {
  create: (data: {
    title?: string;
    sourceIds?: string[];
    sources?: SourceDescriptor[];
  }) => apiPost<{ chat: StudyChat }>("/api/study/chat", data),

  list: () => apiGet<{ chats: StudyChatSummary[] }>("/api/study/chat"),

  get: (id: string) => apiGet<{ chat: StudyChat }>(`/api/study/chat/${id}`),

  patch: (id: string, data: { title?: string; sourceIds?: string[] }) =>
    apiPatch<{ chat: StudyChat }>(`/api/study/chat/${id}`, data),

  remove: (id: string) => apiDelete<{ ok: boolean }>(`/api/study/chat/${id}`),

  /** Stream a grounded answer for the chat. Resolves when the stream ends. */
  stream: (chatId: string, message: string, cb: StreamCallbacks): StreamHandle => {
    const controller = new AbortController();
    const token = getToken();

    const done = (async () => {
      let res: Response;
      try {
        res = await fetch(apiUrl(`/api/study/chat/${chatId}/stream`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        cb.onError?.(e instanceof Error ? e.message : "Request failed");
        return;
      }

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = String(body.error);
        } catch { /* ignore */ }
        cb.onError?.(msg);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done: rdone, value } = await reader.read();
          if (rdone) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by blank lines.
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const evt = parseSse(part);
            if (!evt) continue;
            if (evt.event === "content") {
              try {
                cb.onContent?.(JSON.parse(evt.data).text ?? "");
              } catch { /* ignore */ }
            } else if (evt.event === "error") {
              try {
                cb.onError?.(JSON.parse(evt.data).error ?? "Generation failed");
              } catch {
                cb.onError?.("Generation failed");
              }
            } else if (evt.event === "done") {
              cb.onDone?.();
            }
          }
        }
        // flush any remaining buffered event
        if (buffer.trim()) {
          const evt = parseSse(buffer);
          if (evt?.event === "done") cb.onDone?.();
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          cb.onError?.(e instanceof Error ? e.message : "Stream failed");
        }
      }
    })();

    return {
      abort: () => controller.abort(),
      done,
    };
  },
};

// ---------- tiny helpers wrapping the shared `api` client ----------

async function apiGet<T>(path: string): Promise<T> {
  return api.get<T>(path);
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return api.post<T>(path, body);
}
async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return api.patch<T>(path, body);
}
async function apiDelete<T>(path: string): Promise<T> {
  return api.delete<T>(path);
}

function parseSse(chunk: string): { event: string; data: string } | null {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data && event === "message") return null;
  return { event, data };
}

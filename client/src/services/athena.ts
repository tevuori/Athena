// ===== Athena assistant SSE client =====
// Streams a /api/athena/chat turn via fetch + ReadableStream (EventSource can't
// POST with an Authorization header). Parses SSE events and invokes callbacks.

import { getToken, api, apiUrl } from "./api";

export interface AthenaMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AthenaWindowState {
  id: string;
  appId: string;
  title: string;
  rect: { x: number; y: number; width: number; height: number };
  minimized: boolean;
  focused: boolean;
  /** For Browser windows: the URL currently displayed. */
  browserUrl?: string;
}

export interface AthenaToolEvent {
  id: string;
  name: string;
  state: "preparing" | "running" | "completed" | "canceled" | "error";
  status: string;
  result?: unknown;
}

export interface AthenaClientAction {
  tool: string;
  payload: Record<string, unknown>;
}

export interface AthenaStreamCallbacks {
  onContent?: (text: string, done: boolean) => void;
  onReasoning?: (text: string) => void;
  onTool?: (ev: AthenaToolEvent) => void;
  onClientAction?: (action: AthenaClientAction) => void;
  onUsage?: (usage: unknown) => void;
  onError?: (message: string, status?: number) => void;
  onDone?: () => void;
}

export interface AthenaChatHandle {
  abort: () => void;
  done: Promise<void>;
}

/** Stream one Athena turn. Resolves when the stream ends (done or error). */
export function streamAthenaChat(
  messages: AthenaMessage[],
  cb: AthenaStreamCallbacks,
  windows: AthenaWindowState[] = []
): AthenaChatHandle {
  const controller = new AbortController();
  const token = getToken();

  const done = (async () => {
    let res: Response;
    try {
      res = await fetch(apiUrl("/api/athena/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages, windows }),
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
        if (body?.error != null) {
          const err = body.error;
          // Some error sources (e.g. ZodError from zValidator) return an
          // object rather than a string — stringify it readably instead of
          // rendering "[object Object]".
          msg = typeof err === "string"
            ? err
            : typeof err?.message === "string"
              ? err.message
              : typeof err?.issues?.[0]?.message === "string"
                ? `Invalid request: ${err.issues[0].message}`
                : JSON.stringify(err);
        }
      } catch { /* ignore */ }
      cb.onError?.(msg, res.status);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    const dispatch = (event: string, data: string) => {
      if (!data) return;
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      switch (event) {
        case "content":
          cb.onContent?.(parsed.text ?? "", Boolean(parsed.done));
          break;
        case "reasoning":
          cb.onReasoning?.(parsed.text ?? "");
          break;
        case "tool":
          cb.onTool?.(parsed as AthenaToolEvent);
          break;
        case "client_action":
          cb.onClientAction?.(parsed as AthenaClientAction);
          break;
        case "usage":
          cb.onUsage?.(parsed.usage);
          break;
        case "error":
          cb.onError?.(parsed.error ?? "Athena error", parsed.status);
          break;
        case "done":
          cb.onDone?.();
          break;
      }
    };

    try {
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines.
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
          }
          dispatch(event, dataLines.join("\n"));
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        cb.onError?.(e instanceof Error ? e.message : "Stream interrupted");
      }
    }
  })();

  return {
    abort: () => controller.abort(),
    done,
  };
}

// ===== Tool manifest =====

export interface AthenaToolManifestEntry {
  name: string;
  description: string;
  parameters: unknown[];
  destructive: boolean;
  clientAction: boolean;
}

export async function fetchAthenaTools(): Promise<AthenaToolManifestEntry[]> {
  const token = getToken();
  const res = await fetch(apiUrl("/api/athena/tools"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  const body = await res.json();
  return (body?.tools ?? []) as AthenaToolManifestEntry[];
}

// ===== File attachment =====

export interface AthenaAttachment {
  tempPath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  text: string;
  truncated: boolean;
}

/** Upload a file to Athena for text extraction. Returns extracted text + temp path. */
export async function attachFile(file: File): Promise<AthenaAttachment> {
  const token = getToken();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/api/athena/attach"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Upload failed (${res.status})`);
  }
  return (await res.json()) as AthenaAttachment;
}

/** Save an attached file to permanent storage in a specific folder. */
export async function saveAttachedFile(
  tempPath: string,
  folderId: string | null,
  name?: string
): Promise<{ file: { id: string; name: string } }> {
  const token = getToken();
  const res = await fetch(apiUrl("/api/athena/save-attached"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tempPath, folderId, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Save failed (${res.status})`);
  }
  return await res.json();
}

/** Ask Athena to suggest the best folder for a file. */
export async function suggestFolder(
  fileName: string,
  contentPreview: string
): Promise<{
  folderId: string | null;
  folderPath: string;
  reason: string;
  confidence: number;
}> {
  const token = getToken();
  const res = await fetch(apiUrl("/api/athena/suggest-folder"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fileName, contentPreview }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Suggestion failed (${res.status})`);
  }
  return await res.json();
}

// ---------- Custom instructions (injected into the system prompt) ----------

export async function getAthenaInstructions(): Promise<string> {
  const data = await api.get<{ instructions: string }>("/api/athena/instructions");
  return data.instructions ?? "";
}

export async function setAthenaInstructions(instructions: string): Promise<void> {
  await api.put("/api/athena/instructions", { instructions });
}

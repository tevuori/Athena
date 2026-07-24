// ===== Athena teacher tools (Interactive Teacher / "Teach Me" mode) =====
// Lets Athena drive the existing Notes/Editor/Viewer/Browser apps during a
// live tutoring session: open a source, scroll to a passage, highlight it,
// focus/close a source window, and run comprehension checks.
//
// All tools are clientAction: the server returns a payload and the client
// dispatcher (AthenaApp.dispatchClientAction / TeacherMode) interprets it:
//   - show_source   → open the right app for the source + issue a show command
//   - show_command  → issue a scroll/highlight/clear command to an open window
//   - focus_source  → focus a source window
//   - close_source  → close a source window
//   - check_comprehension → render a comprehension-check chip in the Teacher UI
//
// The LLM is the NL→action resolver: it decides WHEN to call these tools based
// on the conversation, which is more accurate than a separate regex Show
// Controller. The teacher system prompt instructs it to call show_source
// BEFORE the sentence that references a passage.

import path from "node:path";
import type { ToolDef, ClientWindowInfo } from "./plugin";
import prisma from "../../../db/client";
import { resolveSource, type SourceKind } from "../../study/source";

// ----- file-type → app mapping (mirrors client openTargetForFile) -----

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "html", "htm", "css", "xml", "svg", "py",
  "rb", "php", "go", "rs", "java", "c", "h", "cpp", "cs", "kt", "swift", "sh",
  "bash", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "sql", "csv",
  "tsv", "log", "js", "jsx", "ts", "tsx",
]);

function isTextFile(name: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(mime)) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.has(ext);
}

function isPdfFile(name: string, mime: string): boolean {
  if (mime === "application/pdf") return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf";
}

function isImageFile(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Decide which app opens a given source kind + (for files) file metadata. */
function appForSource(
  kind: SourceKind,
  file?: { name: string; mimeType: string } | null
): "notes" | "editor" | "viewer" | "browser" {
  if (kind === "note") return "notes";
  if (kind === "url" || kind === "moodle") return "browser";
  if (kind === "file" && file) {
    if (isTextFile(file.name, file.mimeType)) return "editor";
    if (isPdfFile(file.name, file.mimeType) || isImageFile(file.mimeType)) return "viewer";
    return "viewer";
  }
  return "viewer";
}

/** App-specific payload to open the source in the target app. */
function payloadForSource(
  kind: SourceKind,
  refId: string,
  file?: { name: string; mimeType: string } | null
): Record<string, unknown> {
  if (kind === "note") return { noteId: refId };
  if (kind === "file") return { fileId: refId };
  if (kind === "url" || kind === "moodle") return { url: refId };
  return {};
}

export const teacherTools: ToolDef[] = [
  {
    name: "show_source",
    description:
      "Open a study source on the student's desktop and (optionally) scroll to / highlight a passage while teaching. " +
      "Provide a sourceId (from the session's StudySource list) OR a kind+refId (note id, file id, or URL). " +
      "highlightText scrolls to and highlights the first occurrence of that text. " +
      "highlightLine / highlightLineEnd highlight a line range (1-based) in code/text files. " +
      "Call this RIGHT BEFORE the sentence that references the passage so the visual appears as you speak.",
    clientAction: true,
    parameters: [
      { name: "sourceId", type: "string", description: "StudySource id from the session source list" },
      { name: "kind", type: "string", description: "Source kind (use if no sourceId)", enum: ["note", "file", "url", "moodle"] },
      { name: "refId", type: "string", description: "Note id, file id, or URL (use if no sourceId)" },
      { name: "highlightText", type: "string", description: "Text to scroll to and highlight (first occurrence)" },
      { name: "highlightLine", type: "number", description: "1-based line number to scroll to / start of line-range highlight" },
      { name: "highlightLineEnd", type: "number", description: "End line (inclusive) of a line-range highlight" },
      { name: "label", type: "string", description: "Optional human label for the source (e.g. 'ML notes')" },
    ],
    handler: async (args, { userId }) => {
      // Resolve the source → determine app + open payload.
      let kind: SourceKind;
      let refId: string;
      let name: string;
      let file: { name: string; mimeType: string } | null = null;

      const sourceId = args.sourceId ? String(args.sourceId) : undefined;
      if (sourceId) {
        const ss = await prisma.studySource.findFirst({ where: { id: sourceId, userId } });
        if (!ss) return { error: "StudySource not found" };
        kind = ss.kind as SourceKind;
        refId = ss.refId;
        name = ss.name;
        if (kind === "file") {
          const f = await prisma.vFile.findFirst({ where: { id: refId, userId } });
          if (f) file = { name: f.name, mimeType: f.mimeType };
        }
      } else {
        const k = String(args.kind ?? "") as SourceKind;
        if (!k) return { error: "Provide sourceId or kind+refId." };
        kind = k;
        refId = String(args.refId ?? "");
        if (!refId) return { error: "refId is required when sourceId is not given." };
        // Resolve to get a display name + verify access.
        try {
          const resolved = await resolveSource(userId, descriptorFor(kind, refId, String(args.label ?? "")));
          name = resolved.name;
          if (kind === "file") {
            const f = await prisma.vFile.findFirst({ where: { id: refId, userId } });
            if (f) file = { name: f.name, mimeType: f.mimeType };
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Source resolution failed" };
        }
      }

      const appId = appForSource(kind, file);
      const openPayload = payloadForSource(kind, refId, file);
      const highlightText = args.highlightText ? String(args.highlightText) : undefined;
      const highlightLine = typeof args.highlightLine === "number" ? Number(args.highlightLine) : undefined;
      const highlightLineEnd = typeof args.highlightLineEnd === "number" ? Number(args.highlightLineEnd) : undefined;

      return {
        action: "show_source",
        appId,
        title: String(args.label ?? name ?? "Source"),
        sourceKind: kind,
        sourceRef: refId,
        openPayload,
        highlight: {
          text: highlightText,
          line: highlightLine,
          lineEnd: highlightLineEnd,
        },
      };
    },
  },
  {
    name: "highlight_source",
    description:
      "Highlight a passage in an already-open source window (without re-opening it). " +
      "Provide the windowId (from list_open_windows or the show_source result) and either text, or lineStart+lineEnd for a line range.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Target window id", required: true },
      { name: "text", type: "string", description: "Text to highlight (first occurrence)" },
      { name: "lineStart", type: "number", description: "Start line (1-based, inclusive) for a line-range highlight" },
      { name: "lineEnd", type: "number", description: "End line (1-based, inclusive) for a line-range highlight" },
    ],
    handler: async (args) => ({
      action: "show_command",
      windowId: String(args.windowId ?? ""),
      kind: "highlight",
      text: args.text ? String(args.text) : undefined,
      lineStart: typeof args.lineStart === "number" ? Number(args.lineStart) : undefined,
      lineEnd: typeof args.lineEnd === "number" ? Number(args.lineEnd) : undefined,
    }),
  },
  {
    name: "scroll_source",
    description:
      "Scroll an already-open source window to a passage or line without highlighting. " +
      "Provide the windowId and either text or line.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Target window id", required: true },
      { name: "text", type: "string", description: "Text to scroll to (first occurrence)" },
      { name: "line", type: "number", description: "1-based line number to scroll to" },
    ],
    handler: async (args) => ({
      action: "show_command",
      windowId: String(args.windowId ?? ""),
      kind: "scroll_to",
      text: args.text ? String(args.text) : undefined,
      line: typeof args.line === "number" ? Number(args.line) : undefined,
    }),
  },
  {
    name: "clear_highlight",
    description: "Clear any active teacher highlight in a source window.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Target window id", required: true },
    ],
    handler: async (args) => ({
      action: "show_command",
      windowId: String(args.windowId ?? ""),
      kind: "clear_highlight",
    }),
  },
  {
    name: "focus_source",
    description: "Bring a source window to the front (also un-minimizes it). Use this when referring back to a previously shown source.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Target window id", required: true },
    ],
    handler: async (args) => ({
      action: "focus_source",
      windowId: String(args.windowId ?? ""),
    }),
  },
  {
    name: "close_source",
    description: "Close a source window when the class is done with it.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Target window id", required: true },
    ],
    handler: async (args) => ({
      action: "close_source",
      windowId: String(args.windowId ?? ""),
    }),
  },
  {
    name: "check_comprehension",
    description:
      "Ask the student a comprehension question to check understanding during a lesson. " +
      "The question appears as an interactive chip in the Teacher UI; the student's answer " +
      "is fed back into the conversation. Use this every few turns and after explaining a key concept.",
    clientAction: true,
    parameters: [
      { name: "question", type: "string", description: "The comprehension question to ask", required: true },
      { name: "expectedConcept", type: "string", description: "The concept this question tests (for logging)" },
    ],
    handler: async (args) => ({
      action: "check_comprehension",
      question: String(args.question ?? ""),
      expectedConcept: args.expectedConcept ? String(args.expectedConcept) : undefined,
    }),
  },
];

/** Build a SourceDescriptor from a kind + refId (+ optional name). */
function descriptorFor(kind: SourceKind, refId: string, name: string): { kind: SourceKind; id?: string; url?: string; name?: string } {
  if (kind === "note" || kind === "file") return { kind, id: refId, name };
  if (kind === "url" || kind === "moodle") return { kind, url: refId, name };
  return { kind: "paste", name };
}

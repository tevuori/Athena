// ===== Study Hub source resolution =====
// Resolves a source descriptor ({ kind, id?, text? }) to plain text content
// from a note, a text file on disk, or pasted text. Reused by all study
// workflows so the LLM always receives clean source text.

import path from "node:path";
import { readFile } from "node:fs/promises";
import prisma from "../../db/client";
import { decryptSecret } from "../crypto";
import { fetchResourceContent } from "../moodle";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

/** Maximum source text length sent to the LLM (protects context windows). */
export const MAX_SOURCE_CHARS = 20000;

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "html", "htm", "css", "xml", "svg", "py",
  "rb", "php", "go", "rs", "java", "c", "h", "cpp", "cs", "kt", "swift", "sh",
  "bash", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "sql", "csv",
  "tsv", "log", "js", "jsx", "ts", "tsx",
]);

export type SourceKind = "note" | "file" | "paste" | "moodle";

export interface SourceDescriptor {
  kind: SourceKind;
  /** Note id or file id (required for kind "note" / "file"). */
  id?: string;
  /** Pasted text (required for kind "paste"). */
  text?: string;
  /** Moodle resource URL (required for kind "moodle"). */
  url?: string;
  /** Moodle resource name (optional, for display). */
  name?: string;
}

export interface ResolvedSource {
  /** Display name for logging / UI. */
  name: string;
  /** Full (possibly truncated) text content. */
  text: string;
  /** Reference id for the StudySession log (note id / file id / "paste"). */
  ref: string;
  truncated: boolean;
}

function isTextFile(name: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(mime)) return true;
  if (mime.includes("yaml") || mime.includes("csv")) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.has(ext);
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_SOURCE_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_SOURCE_CHARS) + "\n\n[…truncated…]",
    truncated: true,
  };
}

/** Resolve a source descriptor to text content for the LLM. */
export async function resolveSource(
  userId: string,
  src: SourceDescriptor
): Promise<ResolvedSource> {
  if (src.kind === "paste" || (!src.id && src.text != null)) {
    const text = String(src.text ?? "");
    const t = truncate(text);
    return { name: "Pasted text", text: t.text, ref: "paste", truncated: t.truncated };
  }

  if (src.kind === "note") {
    if (!src.id) throw new Error("Note id is required");
    const note = await prisma.note.findFirst({ where: { id: src.id, userId } });
    if (!note) throw new Error("Note not found");
    const t = truncate(note.content);
    return { name: note.title || "Untitled note", text: t.text, ref: note.id, truncated: t.truncated };
  }

  if (src.kind === "file") {
    if (!src.id) throw new Error("File id is required");
    const file = await prisma.vFile.findFirst({ where: { id: src.id, userId } });
    if (!file) throw new Error("File not found");
    if (!isTextFile(file.name, file.mimeType)) {
      throw new Error(`File '${file.name}' is not a text file`);
    }
    const abs = path.join(UPLOAD_DIR, file.storageKey);
    const content = await readFile(abs, "utf-8");
    const t = truncate(content);
    return { name: file.name, text: t.text, ref: file.id, truncated: t.truncated };
  }

  if (src.kind === "moodle") {
    if (!src.url) throw new Error("Moodle resource URL is required");
    // Get VUT credentials for Moodle SSO.
    const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
    if (!creds) throw new Error("VUT credentials not configured. Log in via the VUT app first.");
    const password = decryptSecret(creds.passwordEnc);
    const content = await fetchResourceContent(userId, src.url, {
      username: creds.username,
      password,
    });
    const t = truncate(content.text);
    return {
      name: src.name || content.name || "Moodle resource",
      text: t.text,
      ref: src.url,
      truncated: t.truncated,
    };
  }

  throw new Error(`Unknown source kind: ${src.kind}`);
}

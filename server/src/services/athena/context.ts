// ===== Athena system prompt + workspace context =====
// Builds the system message injected into every /api/athena/chat turn.
// Includes the 5 most recently opened files (path + short description, NOT full
// content) so the model already "knows" what files exist before the user asks
// to edit one. Full contents are loaded on demand via the read_file tool.

import path from "node:path";
import { readFile } from "node:fs/promises";
import prisma from "../../db/client";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const RECENT_FILE_COUNT = 5;
const TEXT_PREVIEW_CHARS = 200;

function isText(name: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(mime)) return true;
  if (mime.includes("yaml") || mime.includes("csv")) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const textExt = new Set([
    "txt","md","markdown","js","jsx","ts","tsx","json","html","htm","css","scss",
    "xml","svg","py","rb","php","go","rs","java","c","h","cpp","cs","kt","swift",
    "sh","bash","yml","yaml","toml","ini","cfg","conf","env","sql","graphql","vue",
    "svelte","lua","r","dart","scala","csv","tsv","log","diff","patch",
  ]);
  if (textExt.has(ext)) return true;
  const base = path.basename(name).toLowerCase();
  if (base === "makefile" || base === "dockerfile") return true;
  return false;
}

async function displayPath(file: { name: string; folderId: string | null }, userId: string): Promise<string> {
  const parts: string[] = [file.name];
  let curId = file.folderId;
  const allFolders = await prisma.vFolder.findMany({ where: { userId } });
  const byId = new Map(allFolders.map((f) => [f.id, f]));
  let guard = 0;
  while (curId && guard++ < 50) {
    const f = byId.get(curId);
    if (!f) break;
    parts.unshift(f.name);
    curId = f.parentId;
  }
  return parts.join("/");
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Recent files summary: path + short description (no full content). */
export async function recentFilesContext(userId: string): Promise<string> {
  const recent = await prisma.vFile.findMany({
    where: { userId, lastOpenedAt: { not: null } },
    orderBy: { lastOpenedAt: "desc" },
    take: RECENT_FILE_COUNT,
  });
  if (recent.length === 0) return "No recently opened files.";

  const lines = await Promise.all(
    recent.map(async (f) => {
      const p = await displayPath(f, userId);
      const text = isText(f.name, f.mimeType);
      let preview = "";
      if (text) {
        try {
          const content = await readFile(path.join(UPLOAD_DIR, f.storageKey), "utf-8");
          const single = content.replace(/\s+/g, " ").trim();
          preview = single
            ? ` — preview: ${single.slice(0, TEXT_PREVIEW_CHARS)}${single.length > TEXT_PREVIEW_CHARS ? "…" : ""}`
            : " — (empty file)";
      } catch {
        preview = " — (missing on disk)";
      }
      }
      return `- id=${f.id} | ${p} | ${f.mimeType || "unknown"} | ${fmtSize(f.size)}${preview}`;
    })
  );
  return lines.join("\n");
}

/** Lightweight workspace summary (counts) for the system prompt. */
export async function workspaceSummary(userId: string): Promise<string> {
  const [taskCount, noteCount, courseCount, fileCount] = await Promise.all([
    prisma.task.count({ where: { userId } }),
    prisma.note.count({ where: { userId } }),
    prisma.course.count({ where: { userId } }),
    prisma.vFile.count({ where: { userId } }),
  ]);
  const openTasks = await prisma.task.count({ where: { userId, status: "TODO" } });
  return `Tasks: ${taskCount} (${openTasks} open) | Notes: ${noteCount} | Courses: ${courseCount} | Files: ${fileCount}`;
}

export async function buildSystemPrompt(userId: string): Promise<string> {
  const [recent, summary] = await Promise.all([
    recentFilesContext(userId),
    workspaceSummary(userId),
  ]);
  return `You are Athena, the user's personal workspace assistant living inside their Athena Student OS desktop. You can see and act on the user's workspace through tools.

Capabilities (via tools):
- Tasks: create_task, list_tasks, update_task_status
- Grades: list_courses, get_course_grades
- Notes: list_notes, read_note, create_note
- Files: list_files, search_files, read_file, edit_file
- Focus: start_pomodoro (opens the Pomodoro timer on the user's desktop)

Guidelines:
- Be concise and direct. Prefer action over explanation.
- When the user refers to a file by name, it is most likely in the "Recently opened files" list below. Use its id with read_file/edit_file. If not found there, use search_files.
- Before editing a file, read it first so you know the current content, then call edit_file with the FULL new content (edit_file replaces the whole file).
- Destructive actions (edit_file, create_note, update_task_status) are confirmed by the user on the client; proceed normally.
- For start_pomodoro, just call the tool — the timer opens automatically on the user's desktop.
- Use Markdown for formatting responses.
- Don't invent file ids or note ids — always obtain them from list_files / search_files / list_notes first.

Workspace summary: ${summary}

Recently opened files (id | path | type | size | preview):
${recent}`;
}

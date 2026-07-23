// ===== Athena system prompt + workspace context =====
// Builds the system message injected into every /api/athena/chat turn.
// Includes the 5 most recently opened files (path + short description, NOT full
// content) so the model already "knows" what files exist before the user asks
// to edit one. Full contents are loaded on demand via the read_file tool.

import path from "node:path";
import { readFile } from "node:fs/promises";
import prisma from "../../db/client";
import type { ClientWindowInfo } from "./tools/plugin";

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
  const [taskCount, noteCount, courseCount, fileCount, openTasks, dueFlashcards, lastStudySession] = await Promise.all([
    prisma.task.count({ where: { userId } }),
    prisma.note.count({ where: { userId } }),
    prisma.course.count({ where: { userId } }),
    prisma.vFile.count({ where: { userId } }),
    prisma.task.count({ where: { userId, status: "TODO" } }),
    prisma.flashcard.count({ where: { dueDate: { lte: new Date() } } }),
    prisma.studySession.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const parts = [
    `Tasks: ${taskCount} (${openTasks} open)`,
    `Notes: ${noteCount}`,
    `Courses: ${courseCount}`,
    `Files: ${fileCount}`,
  ];
  if (dueFlashcards > 0) {
    parts.push(`Flashcards due: ${dueFlashcards}`);
  }
  if (lastStudySession) {
    const daysAgo = Math.floor((Date.now() - lastStudySession.createdAt.getTime()) / 86400000);
    if (daysAgo === 0) parts.push("Last studied: today");
    else if (daysAgo === 1) parts.push("Last studied: 1 day ago");
    else parts.push(`Last studied: ${daysAgo} days ago`);
  } else {
    parts.push("Last studied: never");
  }
  return parts.join(" | ");
}

function windowsContext(windows: ClientWindowInfo[]): string {
  if (windows.length === 0) return "No windows open.";
  const lines = windows.map((w) => {
    const state = w.minimized ? "minimized" : w.focused ? "focused" : "open";
    return `- id=${w.id} | ${w.appId} "${w.title}" | ${state} | pos=(${w.rect.x},${w.rect.y}) size=${w.rect.width}x${w.rect.height}`;
  });
  return lines.join("\n");
}

export async function buildSystemPrompt(
  userId: string,
  windows: ClientWindowInfo[] = []
): Promise<string> {
  const [recent, summary, user] = await Promise.all([
    recentFilesContext(userId),
    workspaceSummary(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { athenaInstructions: true } }),
  ]);
  const winCtx = windowsContext(windows);
  const instructions = user?.athenaInstructions?.trim() ?? "";
  const instructionsBlock = instructions
    ? `\n\nUser instructions (follow these in every response):\n${instructions}\n`
    : "";
  return `You are Athena, the user's personal workspace assistant living inside their Athena Student OS desktop. You can see and act on the user's workspace through tools.

Capabilities (via tools):
- Tasks: create_task, list_tasks, update_task_status, delete_task
- Grades: list_courses, get_course_grades
- Notes: list_notes, read_note, create_note
- Files: list_files, search_files, read_file, edit_file, create_file
- Habits: list_habits, create_habit, log_habit, delete_habit
- Focus: start_pomodoro (opens the Pomodoro timer on the user's desktop)
- Study Hub: generate_flashcards (creates a deck + opens the Flashcards app), summarize_note (saves a summary note), explain_note (saves an explanation note), generate_study_guide (consolidates notes into a study guide), start_quiz (generates quiz questions + opens Study Hub in quiz mode), create_tasks_from_text (extracts tasks from a note/file/text), open_study_hub (opens the Study Hub app with an optional preselected mode)
- Moodle: list_moodle_courses (lists enrolled VUT Moodle courses), get_moodle_course_contents (lists sections + activities in a course), read_moodle_resource (fetches text content of a Moodle page/file). Requires VUT credentials. Use these to find study materials on Moodle, then generate_flashcards or summarize from them.
- Window management: open_app, close_window, focus_window, minimize_window, resize_window, move_window, list_open_windows, tile_windows
- Workspaces: save_workspace, open_workspace, list_workspaces, delete_workspace

Guidelines:
- Be concise and direct. Prefer action over explanation.
- When the user refers to a file by name, it is most likely in the "Recently opened files" list below. Use its id with read_file/edit_file. If not found there, use search_files. If the file doesn't exist yet, use create_file.
- Before editing a file, read it first so you know the current content, then call edit_file with the FULL new content (edit_file replaces the whole file). Use create_file for new files that don't exist yet — it creates the file in the virtual file system with the given content.
- Destructive actions (edit_file, create_note, update_task_status) are confirmed by the user on the client; proceed normally.
- For start_pomodoro, just call the tool — the timer opens automatically on the user's desktop.
- For window management: use the window ids from "Open windows" below. When opening multiple apps side by side, provide explicit x/y/width/height to open_app (e.g. left half: x=0,y=0,width=960,height=700; right half: x=960,y=0,width=960,height=700). The viewport is typically ~1920x1080 (minus 48px taskbar at bottom). Use tile_windows to auto-arrange already-open windows. Window tools (close/focus/minimize/resize/move) are client-side actions that execute immediately. move_window snaps to a 20px grid.
- For workspaces: save_workspace captures the current window layout (all open windows + their positions/sizes). open_workspace restores a saved layout by closing all current windows and reopening them at their saved positions.
- Study: if the workspace summary shows flashcards due, proactively suggest reviewing them (open the Flashcards app). If the user hasn't studied in a while, suggest summarizing a recent note or taking a quiz. Use the Study Hub tools to act on these suggestions.
- Use Markdown for formatting responses.
- Don't invent file ids, note ids, or window ids — always obtain them from the context lists or list_files / search_files / list_notes first.
${instructionsBlock}
Workspace summary: ${summary}

Open windows (id | app | title | state | position | size):
${winCtx}

Recently opened files (id | path | type | size | preview):
${recent}`;
}

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { markdown } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Search, Plus, Pin, Trash2, FolderPlus, FileText, Tag,
  Download, Loader2, Folder, Pencil, Columns2, Eye, Check,
  ImageIcon, Paperclip, MoreVertical, GraduationCap, X,
} from "lucide-react";
import { notesApi } from "../../services/notes";
import { filesApi } from "../../services/files";
import { linksApi } from "../../services/links";
import { useSettings } from "../../store/settings";
import { useWindows } from "../../store/windows";
import type { Note, NoteFolder } from "../../types";
import type { WindowInstance } from "../../store/windows";
import { setLinkPayload, readLinkPayload, allowLinkDrop } from "../links/linkDnd";
import LinkBadge from "../links/LinkBadge";

type EditorMode = "edit" | "split" | "preview";

const SAVE_DEBOUNCE_MS = 1500;

export default function NotesApp({ win }: { win: WindowInstance }) {
  const isDark = useSettings((s) => s.theme === "dark");
  const openWindow = useWindows((s) => s.open);

  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<EditorMode>("split");
  const [noteLinkSignal, setNoteLinkSignal] = useState(0);

  // Overlay sidebars — shown as toggled overlays when the window is too narrow
  // for them to sit inline (controlled by container queries).
  const [overlayFolders, setOverlayFolders] = useState(false);
  const [overlayNotes, setOverlayNotes] = useState(false);

  // Auto-switch out of split view when the window is too narrow for two panes.
  // @6xl (72rem = 1152px) is the breakpoint where split is comfortable.
  useEffect(() => {
    if (mode === "split" && win.rect.width < 1152) setMode("edit");
  }, [win.rect.width, mode]);

  // Folder context menu + inline rename
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Dirty tracking (per-note) for save indicator + debounced flush.
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const notesRef = useRef<Note[]>([]);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  notesRef.current = notes;

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  const loadFolders = useCallback(async () => {
    try {
      const { folders } = await notesApi.listFolders();
      setFolders(folders);
    } catch (e) {
      console.error("Failed to load folders", e);
    }
  }, []);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const { notes } = await notesApi.list({
        q: query || undefined,
        folderId: selectedFolder ?? undefined,
      });
      setNotes(notes);
    } catch (e) {
      console.error("Failed to load notes", e);
    } finally {
      setLoading(false);
    }
  }, [query, selectedFolder]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Auto-select a note when opened with a noteId payload (e.g. from the
  // Study Hub "Open note" button after generating a summary/explanation).
  useEffect(() => {
    const noteId = win.payload?.noteId;
    if (typeof noteId !== "string" || notes.length === 0) return;
    if (notes.some((n) => n.id === noteId)) setSelectedId(noteId);
  }, [win.payload, notes]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(loadNotes, 250);
    return () => clearTimeout(t);
  }, [query, loadNotes]);

  const createNote = async (initial?: Partial<Note>) => {
    try {
      const { note } = await notesApi.create({
        title: "Untitled",
        content: "",
        folderId: selectedFolder,
        ...initial,
      });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
      return note;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const createFolder = async () => {
    const name = prompt("Folder name:");
    if (!name) return;
    try {
      const { folder } = await notesApi.createFolder({ name, parentId: selectedFolder });
      setFolders((prev) => [...prev, folder]);
    } catch (e) {
      console.error(e);
    }
  };

  const startRenameFolder = (folder: NoteFolder) => {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
    setFolderMenu(null);
  };

  const confirmRenameFolder = async () => {
    if (!renamingFolderId || !renameValue.trim()) {
      setRenamingFolderId(null);
      return;
    }
    try {
      const { folder } = await notesApi.updateFolder(renamingFolderId, { name: renameValue.trim() });
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    } catch (e) {
      console.error(e);
    }
    setRenamingFolderId(null);
  };

  const deleteFolder = async (folder: NoteFolder) => {
    setFolderMenu(null);
    if (!confirm(`Delete folder "${folder.name}"? Notes inside will be moved to All Notes.`)) return;
    try {
      await notesApi.deleteFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      if (selectedFolder === folder.id) setSelectedFolder(null);
      loadNotes();
    } catch (e) {
      console.error(e);
    }
  };

  // Flush a single note's pending changes to the server immediately.
  const flushSave = useCallback(async (id: string) => {
    const timer = saveTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      saveTimersRef.current.delete(id);
    }
    const note = notesRef.current.find((n) => n.id === id);
    if (!note) return;
    setSaving(true);
    try {
      await notesApi.update(id, {
        title: note.title,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
      });
      setDirtyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  }, []);

  // Optimistic local update + debounced server persist.
  const updateNote = useCallback(
    (id: string, data: Partial<Note>) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...data, updatedAt: new Date().toISOString() } : n
        )
      );
      setDirtyIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const existing = saveTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        void flushSave(id);
      }, SAVE_DEBOUNCE_MS);
      saveTimersRef.current.set(id, timer);
    },
    [flushSave]
  );

  // Insert markdown text at the end of the current note's content.
  const insertAtCursor = useCallback((text: string) => {
    const note = notesRef.current.find((n) => n.id === selectedId);
    if (!note) return;
    const newContent = note.content + (note.content && !note.content.endsWith("\n") ? "\n\n" : "") + text;
    updateNote(note.id, { content: newContent });
  }, [selectedId, updateNote]);

  // Upload an image file and insert a markdown image reference.
  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    try {
      const { file: uploaded } = await filesApi.upload(file);
      const url = filesApi.downloadUrl(uploaded.id);
      const alt = file.name.replace(/\.[^.]+$/, "");
      insertAtCursor(`![${alt}](${url})`);
    } catch (err) {
      console.error("Image upload failed", err);
    } finally {
      e.target.value = "";
    }
  };

  // Handle drag-drop onto the editor. File drops insert a markdown link/image
  // (existing behavior) AND create an ItemLink. Other linkable items
  // (task/deck/event) just create an ItemLink.
  const onEditorDrop = async (e: React.DragEvent) => {
    if (!selected) return;
    const payload = readLinkPayload(e);
    if (!payload) return;
    e.preventDefault();
    // Create the link relation (skip self-link).
    if (!(payload.type === "note" && payload.id === selected.id)) {
      try {
        await linksApi.create(payload.type, payload.id, "note", selected.id);
        setNoteLinkSignal((n) => n + 1);
      } catch (err) {
        console.error("Link failed", err);
      }
    }
    // For file drops, also insert a markdown reference (existing behavior).
    if (payload.type === "file") {
      try {
        const { files } = await filesApi.all();
        const file = files.find((f) => f.id === payload.id);
        if (file) {
          const url = filesApi.downloadUrl(file.id);
          const isImage = file.mimeType.startsWith("image/");
          if (isImage) {
            insertAtCursor(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`);
          } else {
            insertAtCursor(`[${file.name}](${url})`);
          }
        }
      } catch (err) {
        console.error("File reference insert failed", err);
      }
    }
  };

  // Flush all pending saves on unmount.
  useEffect(() => {
    return () => {
      saveTimersRef.current.forEach((t) => clearTimeout(t));
      saveTimersRef.current.clear();
    };
  }, []);

  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    const timer = saveTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      saveTimersRef.current.delete(id);
    }
    try {
      await notesApi.delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const togglePin = (note: Note) => {
    updateNote(note.id, { pinned: !note.pinned });
  };

  // Open Study Hub with this note as the source, in the given mode.
  const studyFromNote = (noteId: string, mode: "flashcards" | "summarize" | "quiz" | "explain" | "study_guide") => {
    openWindow({
      appId: "study",
      title: "Study Hub",
      icon: "GraduationCap",
      payload: { mode, sourceKind: "note", sourceId: noteId },
    });
    setNoteMenu(null);
  };

  const exportMarkdown = (note: Note) => {
    const blob = new Blob([`# ${note.title}\n\n${note.content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.title || "untitled"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!selected) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${selected.title}</title>
      <style>body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1e293b}
      h1,h2,h3{color:#0f172a}code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:monospace}
      pre{background:#f1f5f9;padding:12px;border-radius:8px;overflow-x:auto}blockquote{border-left:3px solid #cbd5e1;padding-left:16px;color:#64748b}</style>
      </head><body><h1>${selected.title}</h1><div id="c"></div>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      <script>document.getElementById('c').innerHTML=marked.parse(${JSON.stringify(selected.content)});setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    w.document.close();
  };

  // Ctrl/Cmd+S saves the selected note immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (selectedId) {
          e.preventDefault();
          void flushSave(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, flushSave]);

  const markdownExtensions = useMemo(() => [EditorView.lineWrapping], []);

  return (
    <div className="relative flex h-full">
      {/* Backdrop for overlay sidebars (narrow only) */}
      {(overlayFolders || overlayNotes) && (
        <div
          className="@5xl:hidden absolute inset-0 z-10 bg-black/40"
          onClick={() => { setOverlayFolders(false); setOverlayNotes(false); }}
        />
      )}

      {/* Sidebar: folders + search — inline @5xl+, overlay when narrow */}
      <div
        className={[
          "absolute inset-y-0 left-0 z-20 shrink-0 flex w-56 flex-col border-r border-edge bg-surface-2 shadow-window",
          overlayFolders ? "flex" : "hidden",
          "@5xl:static @5xl:z-auto @5xl:flex @5xl:shadow-none",
        ].join(" ")}
      >
        {/* Close button — overlay mode only (narrow) */}
        <div className="@5xl:hidden flex items-center justify-between border-b border-edge px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Folders</span>
          <button onClick={() => setOverlayFolders(false)} className="rounded p-0.5 text-ink-muted hover:bg-surface-3 hover:text-ink" title="Hide">
            <X size={14} />
          </button>
        </div>
        <div className="p-2.5">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-edge bg-surface px-2.5 py-1.5">
            <Search size={14} className="text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes..."
              className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => createNote()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New
            </button>
            <button
              onClick={createFolder}
              className="flex items-center justify-center rounded-lg border border-edge px-2 py-1.5 text-ink-muted hover:bg-surface-3"
              title="New folder"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
              selectedFolder === null ? "bg-accent/15 text-accent" : "text-ink hover:bg-surface-3"
            }`}
          >
            <Folder size={14} /> All notes
          </button>
          {folders.map((f) => (
            <div
              key={f.id}
              className={`group mb-0.5 flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-left text-xs ${
                selectedFolder === f.id ? "bg-accent/15 text-accent" : "text-ink hover:bg-surface-3"
              }`}
            >
              <Folder size={14} className="shrink-0" />
              {renamingFolderId === f.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={confirmRenameFolder}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRenameFolder();
                    if (e.key === "Escape") setRenamingFolderId(null);
                  }}
                  className="flex-1 rounded border border-accent bg-surface px-1 py-0 text-xs text-ink outline-none"
                />
              ) : (
                <button
                  onClick={() => setSelectedFolder(f.id)}
                  onDoubleClick={() => startRenameFolder(f)}
                  className="flex-1 truncate text-left"
                >
                  {f.name}
                </button>
              )}
              {renamingFolderId !== f.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderMenu({ x: e.clientX, y: e.clientY, folderId: f.id });
                  }}
                  className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                  title="More options"
                >
                  <MoreVertical size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Folder context menu */}
      {folderMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setFolderMenu(null)} onContextMenu={(e) => { e.preventDefault(); setFolderMenu(null); }} />
          <div
            className="fixed z-50 min-w-[140px] rounded-lg border border-edge bg-surface py-1 shadow-window"
            style={{ left: folderMenu.x, top: folderMenu.y }}
          >
            <button
              onClick={() => {
                const f = folders.find((x) => x.id === folderMenu.folderId);
                if (f) startRenameFolder(f);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3"
            >
              <Pencil size={12} /> Rename
            </button>
            <button
              onClick={() => {
                const f = folders.find((x) => x.id === folderMenu.folderId);
                if (f) deleteFolder(f);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-surface-3"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}

      {/* Note context menu */}
      {noteMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setNoteMenu(null)} onContextMenu={(e) => { e.preventDefault(); setNoteMenu(null); }} />
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border border-edge bg-surface py-1 shadow-window"
            style={{ left: noteMenu.x, top: noteMenu.y }}
          >
            <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
              Study
            </div>
            <button onClick={() => studyFromNote(noteMenu.noteId, "summarize")} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3">
              <GraduationCap size={12} /> Summarize
            </button>
            <button onClick={() => studyFromNote(noteMenu.noteId, "explain")} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3">
              <GraduationCap size={12} /> Explain
            </button>
            <button onClick={() => studyFromNote(noteMenu.noteId, "flashcards")} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3">
              <GraduationCap size={12} /> Make Flashcards
            </button>
            <button onClick={() => studyFromNote(noteMenu.noteId, "quiz")} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3">
              <GraduationCap size={12} /> Quiz Me
            </button>
            <button onClick={() => studyFromNote(noteMenu.noteId, "study_guide")} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3">
              <GraduationCap size={12} /> Add to Study Guide
            </button>
            <div className="my-1 border-t border-edge" />
            <button
              onClick={() => {
                const n = notes.find((x) => x.id === noteMenu.noteId);
                if (n) togglePin(n);
                setNoteMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-3"
            >
              <Pin size={12} /> {notes.find((x) => x.id === noteMenu.noteId)?.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={() => {
                deleteNote(noteMenu.noteId);
                setNoteMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-surface-3"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}

      {/* Note list — inline @3xl+, overlay when narrow */}
      <div
        className={[
          "absolute inset-y-0 left-0 z-20 shrink-0 flex w-60 flex-col border-r border-edge bg-surface shadow-window",
          overlayNotes ? "flex" : "hidden",
          "@3xl:static @3xl:z-auto @3xl:flex @3xl:shadow-none",
        ].join(" ")}
      >
        {/* Close button — overlay mode only (narrow) */}
        <div className="@3xl:hidden flex items-center justify-between border-b border-edge px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Notes</span>
          <button onClick={() => setOverlayNotes(false)} className="rounded p-0.5 text-ink-muted hover:bg-surface-3 hover:text-ink" title="Hide">
            <X size={14} />
          </button>
        </div>
        <div className="flex items-center justify-between border-b border-edge px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {notes.length} notes
          </span>
          {saving && (
            <span className="flex items-center gap-1 text-[10px] text-ink-muted">
              <Loader2 size={10} className="animate-spin" /> Saving
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={20} className="animate-spin text-ink-muted" />
            </div>
          ) : notes.length === 0 ? (
            <p className="p-4 text-center text-xs text-ink-muted">No notes yet</p>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setLinkPayload(e, { type: "note", id: note.id, title: note.title || "Untitled" });
                }}
                onClick={() => setSelectedId(note.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setNoteMenu({ x: e.clientX, y: e.clientY, noteId: note.id });
                }}
                className={`group block w-full border-b border-edge/50 px-3 py-2.5 text-left transition ${
                  selectedId === note.id ? "bg-accent/10" : "hover:bg-surface-2"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="line-clamp-1 text-sm font-medium text-ink">
                    {dirtyIds.has(note.id) && <span className="text-amber-400">● </span>}
                    {note.title || "Untitled"}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {note.pinned && <Pin size={11} className="mt-0.5 text-accent" />}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteMenu({ x: e.clientX, y: e.clientY, noteId: note.id });
                      }}
                      className="rounded p-0.5 text-ink-muted opacity-0 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                      title="More options"
                    >
                      <MoreVertical size={12} />
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">
                  {note.content.replace(/[#*`>\-]/g, "").slice(0, 80) || "Empty note"}
                </p>
                {note.tags && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {note.tags.split(",").filter(Boolean).slice(0, 3).map((t) => (
                      <span key={t} className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-ink-muted">
                        {t.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
              {/* Toggle buttons for collapsed sidebars (narrow only) */}
              <button
                onClick={() => setOverlayFolders(true)}
                className="@5xl:hidden flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3"
                title="Show folders"
              >
                <Folder size={14} />
              </button>
              <button
                onClick={() => setOverlayNotes(true)}
                className="@3xl:hidden flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3"
                title="Show notes list"
              >
                <FileText size={14} />
              </button>
              <input
                value={selected.title}
                onChange={(e) => updateNote(selected.id, { title: e.target.value })}
                onBlur={() => void flushSave(selected.id)}
                placeholder="Note title"
                className="flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
              />
              <LinkBadge type="note" id={selected.id} refreshSignal={noteLinkSignal} />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onImagePicked}
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3"
                title="Insert image"
              >
                <ImageIcon size={14} />
              </button>
              <button
                onClick={() => togglePin(selected)}
                className={`flex h-7 w-7 items-center justify-center rounded ${
                  selected.pinned ? "text-accent" : "text-ink-muted hover:bg-surface-3"
                }`}
                title="Pin"
              >
                <Pin size={14} />
              </button>
              <div className="mr-1 flex items-center rounded-lg border border-edge">
                <ToolToggle active={mode === "edit"} onClick={() => setMode("edit")} title="Editor only">
                  <Pencil size={13} />
                </ToolToggle>
                <ToolToggle active={mode === "split"} onClick={() => setMode("split")} title="Split view" className="hidden @6xl:flex">
                  <Columns2 size={13} />
                </ToolToggle>
                <ToolToggle active={mode === "preview"} onClick={() => setMode("preview")} title="Preview only">
                  <Eye size={13} />
                </ToolToggle>
              </div>
              <button
                onClick={() => exportMarkdown(selected)}
                className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3"
                title="Export Markdown"
              >
                <Download size={14} />
              </button>
              <button
                onClick={exportPDF}
                className="rounded px-2 py-1 text-xs text-ink-muted hover:bg-surface-3"
                title="Export PDF"
              >
                PDF
              </button>
              <button
                onClick={() => deleteNote(selected.id)}
                className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-red-500 hover:text-white"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-edge bg-surface-2 px-3 py-1.5">
              <div className="ml-auto flex items-center gap-2">
                {dirtyIds.has(selected.id) && (
                  <span className="text-[10px] text-amber-400">Unsaved</span>
                )}
                {!dirtyIds.has(selected.id) && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                    <Check size={10} /> Saved
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
              <Tag size={12} className="text-ink-muted" />
              <input
                value={selected.tags}
                onChange={(e) => updateNote(selected.id, { tags: e.target.value })}
                onBlur={() => void flushSave(selected.id)}
                placeholder="tags, comma, separated"
                className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
              />
            </div>

            <NoteEditor
              note={selected}
              mode={mode}
              isDark={isDark}
              extensions={markdownExtensions}
              onChange={(content) => updateNote(selected.id, { content })}
              onBlur={() => void flushSave(selected.id)}
              onDrop={onEditorDrop}
            />
          </>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center text-ink-muted">
            {/* Toggle buttons for collapsed sidebars (narrow only) */}
            <div className="absolute left-2 top-2 flex gap-1">
              <button
                onClick={() => setOverlayFolders(true)}
                className="@5xl:hidden flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3"
                title="Show folders"
              >
                <Folder size={14} />
              </button>
              <button
                onClick={() => setOverlayNotes(true)}
                className="@3xl:hidden flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-3"
                title="Show notes list"
              >
                <FileText size={14} />
              </button>
            </div>
            <FileText size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Subcomponents =====

function ToolToggle({
  active,
  onClick,
  title,
  className = "",
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center ${className} ${
        active ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function NoteEditor({
  note,
  mode,
  isDark,
  extensions,
  onChange,
  onBlur,
  onDrop,
}: {
  note: Note;
  mode: EditorMode;
  isDark: boolean;
  extensions: Extension[];
  onChange: (content: string) => void;
  onBlur: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  const showEditor = mode === "edit" || mode === "split";
  const showPreview = mode === "preview" || mode === "split";

  return (
    <div
      className="flex flex-1 overflow-hidden"
      onDragOver={allowLinkDrop}
      onDrop={onDrop}
    >
      {showEditor && (
        <div className={showPreview ? "w-1/2 border-r border-edge" : "w-full"}>
          <CodeMirror
            value={note.content}
            onChange={onChange}
            extensions={[markdown(), ...extensions]}
            theme={isDark ? oneDark : "light"}
            height="100%"
            className="h-full text-sm"
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              searchKeymap: true,
              tabSize: 2,
            }}
            onBlur={onBlur}
          />
        </div>
      )}
      {showPreview && (
        <div className={`${showEditor ? "w-1/2" : "w-full"} overflow-auto bg-surface p-5`}>
          <div className="selectable markdown-body mx-auto max-w-none @5xl:max-w-2xl prose-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                img: ({ src, alt }) => (
                  <img
                    src={typeof src === "string" ? src : undefined}
                    alt={alt ?? ""}
                    className="my-3 max-w-full rounded-lg border border-edge"
                    loading="lazy"
                  />
                ),
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:opacity-80">
                    {children}
                  </a>
                ),
              }}
            >
              {note.content || "*Nothing to preview yet.*"}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

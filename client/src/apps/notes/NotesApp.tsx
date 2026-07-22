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
} from "lucide-react";
import { notesApi } from "../../services/notes";
import { useSettings } from "../../store/settings";
import type { Note, NoteFolder } from "../../types";
import type { WindowInstance } from "../../store/windows";

type EditorMode = "edit" | "split" | "preview";

const SAVE_DEBOUNCE_MS = 1500;

export default function NotesApp(_: { win: WindowInstance }) {
  const isDark = useSettings((s) => s.theme === "dark");

  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<EditorMode>("split");

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
    <div className="flex h-full">
      {/* Sidebar: folders + search */}
      <div className="flex w-56 shrink-0 flex-col border-r border-edge bg-surface-2">
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
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                selectedFolder === f.id ? "bg-accent/15 text-accent" : "text-ink hover:bg-surface-3"
              }`}
            >
              <Folder size={14} /> {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Note list */}
      <div className="flex w-60 shrink-0 flex-col border-r border-edge">
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
                onClick={() => setSelectedId(note.id)}
                className={`block w-full border-b border-edge/50 px-3 py-2.5 text-left transition ${
                  selectedId === note.id ? "bg-accent/10" : "hover:bg-surface-2"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="line-clamp-1 text-sm font-medium text-ink">
                    {dirtyIds.has(note.id) && <span className="text-amber-400">● </span>}
                    {note.title || "Untitled"}
                  </span>
                  {note.pinned && <Pin size={11} className="mt-0.5 shrink-0 text-accent" />}
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
              <input
                value={selected.title}
                onChange={(e) => updateNote(selected.id, { title: e.target.value })}
                onBlur={() => void flushSave(selected.id)}
                placeholder="Note title"
                className="flex-1 bg-transparent text-sm font-semibold text-ink outline-none"
              />
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
                <ToolToggle active={mode === "split"} onClick={() => setMode("split")} title="Split view">
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
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-ink-muted">
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
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center ${
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
}: {
  note: Note;
  mode: EditorMode;
  isDark: boolean;
  extensions: Extension[];
  onChange: (content: string) => void;
  onBlur: () => void;
}) {
  const showEditor = mode === "edit" || mode === "split";
  const showPreview = mode === "preview" || mode === "split";

  return (
    <div className="flex flex-1 overflow-hidden">
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
          <div className="selectable markdown-body mx-auto max-w-2xl prose-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {note.content || "*Nothing to preview yet.*"}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

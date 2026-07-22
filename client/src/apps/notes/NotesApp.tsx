import { useState, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Search, Plus, Pin, Trash2, FolderPlus, FileText, Tag,
  Download, Loader2, Folder,
} from "lucide-react";
import { notesApi } from "../../services/notes";
import type { Note, NoteFolder } from "../../types";
import type { WindowInstance } from "../../store/windows";

export default function NotesApp(_: { win: WindowInstance }) {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

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

  const createNote = async () => {
    try {
      const { note } = await notesApi.create({
        title: "Untitled",
        content: "",
        folderId: selectedFolder,
      });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
    } catch (e) {
      console.error(e);
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

  // Auto-save (debounced)
  const updateNote = useCallback(
    async (id: string, data: Partial<Note>) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...data, updatedAt: new Date().toISOString() } : n))
      );
      setSaving(true);
      try {
        await notesApi.update(id, data);
      } catch (e) {
        console.error("Save failed", e);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await notesApi.delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const togglePin = async (note: Note) => {
    await updateNote(note.id, { pinned: !note.pinned });
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
              onClick={createNote}
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

        {/* Folder tree */}
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
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="rounded px-2 py-1 text-xs text-ink-muted hover:bg-surface-3"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
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

            <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
              <Tag size={12} className="text-ink-muted" />
              <input
                value={selected.tags}
                onChange={(e) => updateNote(selected.id, { tags: e.target.value })}
                placeholder="tags, comma, separated"
                className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
              />
            </div>

            {showPreview ? (
              <div className="selectable flex-1 overflow-y-auto p-5 prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">
                  {selected.content || "*Nothing to preview yet.*"}
                </ReactMarkdown>
              </div>
            ) : (
              <textarea
                value={selected.content}
                onChange={(e) => updateNote(selected.id, { content: e.target.value })}
                placeholder="Start writing in Markdown..."
                className="selectable flex-1 resize-none bg-transparent p-5 font-mono text-sm leading-relaxed text-ink outline-none"
                spellCheck={false}
              />
            )}
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

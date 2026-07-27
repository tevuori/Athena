import { useCallback, useEffect, useState } from "react";
import { Folder, Pin, Plus, Search, Trash2 } from "lucide-react";
import { notesApi } from "../services/notes";
import type { Note, NoteFolder } from "../types";
import { MobileContainer, MobileEmpty, MobileFab, MobileHeader, MobileInput, MobileLoading, MobileTextarea } from "./MobileUi";

export default function MobileNotes({ onClose }: { onClose?: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [view, setView] = useState<"list" | "detail">("list");
  const [selected, setSelected] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const loadFolders = useCallback(async () => {
    const res = await notesApi.listFolders().catch(() => null);
    if (res) setFolders(res.folders);
  }, []);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const res = await notesApi
      .list({ q: query || undefined, folderId: folderId ?? undefined })
      .catch(() => null);
    const list = res?.notes ?? [];
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    });
    setNotes(list);
    setLoading(false);
  }, [query, folderId]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadNotes();
    }, 250);
    return () => clearTimeout(t);
  }, [loadNotes]);

  const openDetail = (note: Note) => {
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
    setView("detail");
  };

  const createNote = async () => {
    const res = await notesApi
      .create({ title: "", content: "", folderId })
      .catch(() => null);
    if (res?.note) {
      setNotes((list) => [res.note, ...list]);
      openDetail(res.note);
    }
  };

  const save = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await notesApi.update(selected.id, { title, content });
      if (res?.note) {
        setSelected(res.note);
        setNotes((list) => list.map((n) => (n.id === res.note.id ? res.note : n)));
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  }, [selected, title, content]);

  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => {
      if (title !== selected.title || content !== selected.content) void save();
    }, 1000);
    return () => clearTimeout(t);
  }, [title, content, selected?.id]);

  const togglePin = async () => {
    if (!selected) return;
    const next = !selected.pinned;
    setSelected((n) => (n ? { ...n, pinned: next } : null));
    setNotes((list) => list.map((n) => (n.id === selected.id ? { ...n, pinned: next } : n)));
    await notesApi.update(selected.id, { pinned: next }).catch(() => {});
  };

  const deleteNote = async () => {
    if (!selected) return;
    if (!window.confirm("Delete this note?")) return;
    await notesApi.delete(selected.id).catch(() => {});
    setNotes((list) => list.filter((n) => n.id !== selected.id));
    setSelected(null);
    setView("list");
  };

  const createFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    const res = await notesApi.createFolder({ name: name.trim() }).catch(() => null);
    if (res?.folder) setFolders((list) => [...list, res.folder]);
  };

  if (view === "detail" && selected) {
    return (
      <MobileContainer>
        <MobileHeader
          title={title || "Untitled"}
          subtitle="Note"
          onBack={() => setView("list")}
          right={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void togglePin()}
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected.pinned ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[.06] text-slate-400"}`}
              >
                <Pin size={20} />
              </button>
              <button
                type="button"
                onClick={() => void deleteNote()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[.06] text-slate-400 active:bg-rose-500/20 active:text-rose-400"
              >
                <Trash2 size={20} />
              </button>
            </div>
          }
        />
        {saving && <p className="mb-2 text-xs text-slate-500">Saving…</p>}
        <MobileInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="mb-3"
        />
        <MobileTextarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write something…"
          rows={16}
        />
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <MobileHeader title="Notes" subtitle="Capture ideas" onClose={onClose} right={<MobileFab onClick={createNote} icon={<Plus size={22} />} />} />

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.045] px-3 py-2">
        <Search size={18} className="text-slate-500" />
        <MobileInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          className="border-0 bg-transparent px-2 py-1 text-sm"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFolderId(null)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
            folderId === null ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"
          }`}
        >
          All
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFolderId(f.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
              folderId === f.id ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"
            }`}
          >
            {f.name}
          </button>
        ))}
        <button
          type="button"
          onClick={createFolder}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/[.06] px-4 py-2 text-sm font-medium text-slate-300"
        >
          <Folder size={14} /> New
        </button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <MobileLoading />
        ) : notes.length ? (
          notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => openDetail(note)}
              className="w-full rounded-2xl border border-white/10 bg-white/[.045] p-4 text-left active:bg-white/[.08]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-white">{note.title || "Untitled"}</span>
                {note.pinned && <Pin size={16} className="shrink-0 text-indigo-300" />}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{note.content}</p>
              <p className="mt-2 text-[11px] text-slate-500">{new Date(note.updatedAt).toLocaleDateString()}</p>
            </button>
          ))
        ) : (
          <MobileEmpty text="No notes yet. Tap + to capture an idea." />
        )}
      </div>
    </MobileContainer>
  );
}

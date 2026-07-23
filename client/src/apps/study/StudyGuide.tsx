// ===== Study Hub: Study Guide (consolidate multiple notes) =====

import { useState, useEffect, useMemo } from "react";
import { Sparkles, FileText, Search, StickyNote, GraduationCap, Plus, X } from "lucide-react";
import { ActionButton, ErrorBanner, Loading, MarkdownView, SuccessBanner } from "./ui";
import { studyApi, type SourceDescriptor } from "../../services/study";
import { notesApi } from "../../services/notes";
import SourcePicker from "./SourcePicker";
import type { Note } from "../../types";
import { useWindows } from "../../store/windows";

export default function StudyGuide() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [guide, setGuide] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [extraSources, setExtraSources] = useState<SourceDescriptor[]>([]);
  const [showExtraSource, setShowExtraSource] = useState(false);
  const [extraSource, setExtraSource] = useState<SourceDescriptor | null>(null);
  const openWindow = useWindows((s) => s.open);

  useEffect(() => {
    setLoading(true);
    notesApi.list().then((r) => setNotes(r.notes)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    if (selected.size === 0 && extraSources.length === 0) return;
    setGenLoading(true);
    setError("");
    setSuccess("");
    setGuide("");
    setNoteId(null);
    try {
      const res = await studyApi.studyGuide({
        noteIds: selected.size > 0 ? [...selected] : undefined,
        sources: extraSources.length > 0 ? extraSources : undefined,
        saveAsNote: true,
        noteTitle: title.trim() || undefined,
      });
      setGuide(res.guide);
      setNoteId(res.noteId);
      if (res.noteId) setSuccess("Study guide saved as a new note.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate study guide");
    } finally {
      setGenLoading(false);
    }
  };

  const openNote = () => {
    if (!noteId) return;
    openWindow({ appId: "notes", title: "Notes", icon: "StickyNote", payload: { noteId } });
  };

  const studyFurther = (mode: "flashcards" | "quiz") => {
    if (!noteId) return;
    openWindow({
      appId: "study",
      title: "Study Hub",
      icon: "GraduationCap",
      payload: { mode, sourceKind: "note", sourceId: noteId },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Select multiple notes to consolidate into a single study guide / cheat sheet.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-md border border-edge bg-surface-2 px-7 py-1.5 text-xs text-ink outline-none focus:border-accent"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Title (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Study Guide"
            className="w-48 rounded-md border border-edge bg-surface-2 px-2 py-1.5 text-ink outline-none focus:border-accent"
          />
        </label>
        <ActionButton onClick={run} disabled={selected.size === 0 && extraSources.length === 0} loading={genLoading}>
          <Sparkles size={13} /> Generate ({selected.size + extraSources.length})
        </ActionButton>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-md border border-edge bg-surface-2">
        {loading ? (
          <div className="p-2 text-xs text-ink-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-2 text-xs text-ink-muted">No notes found.</div>
        ) : (
          filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => toggle(n.id)}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-surface-3 ${
                selected.has(n.id) ? "bg-accent/10 text-accent" : "text-ink"
              }`}
            >
              <StickyNote size={12} className="shrink-0 opacity-60" />
              <span className="truncate">{n.title || "Untitled"}</span>
              {selected.has(n.id) && <span className="ml-auto text-accent">✓</span>}
            </button>
          ))
        )}
      </div>

      {/* Extra sources (files, paste, Moodle) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">Additional sources (optional)</span>
          {!showExtraSource && (
            <button
              onClick={() => setShowExtraSource(true)}
              className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              <Plus size={12} /> Add source
            </button>
          )}
        </div>
        {extraSources.map((src, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-xs">
            <FileText size={12} className="shrink-0 text-ink-muted" />
            <span className="truncate flex-1 text-ink">
              {src.kind === "paste" ? "Pasted text" : src.kind === "moodle" ? src.name ?? "Moodle resource" : src.id ?? src.kind}
            </span>
            <span className="text-[10px] uppercase text-ink-muted">{src.kind}</span>
            <button
              onClick={() => setExtraSources((prev) => prev.filter((_, idx) => idx !== i))}
              className="rounded p-0.5 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {showExtraSource && (
          <div className="flex flex-col gap-2">
            <SourcePicker value={extraSource} onChange={setExtraSource} />
            <div className="flex gap-2">
              <ActionButton
                onClick={() => {
                  if (extraSource) {
                    setExtraSources((prev) => [...prev, extraSource]);
                    setExtraSource(null);
                  }
                  setShowExtraSource(false);
                }}
                disabled={!extraSource}
              >
                <Plus size={13} /> Add
              </ActionButton>
              <ActionButton
                onClick={() => { setShowExtraSource(false); setExtraSource(null); }}
                variant="ghost"
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        )}
      </div>

      {genLoading && <Loading label="Generating study guide…" />}
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="flex flex-wrap items-center gap-2">
          <SuccessBanner message={success} />
          {noteId && (
            <ActionButton onClick={openNote} variant="ghost">
              <FileText size={12} /> Open note
            </ActionButton>
          )}
          {noteId && (
            <ActionButton onClick={() => studyFurther("flashcards")} variant="ghost">
              <GraduationCap size={12} /> Flashcards
            </ActionButton>
          )}
          {noteId && (
            <ActionButton onClick={() => studyFurther("quiz")} variant="ghost">
              <GraduationCap size={12} /> Quiz me
            </ActionButton>
          )}
        </div>
      )}
      {guide && <MarkdownView content={guide} />}
    </div>
  );
}

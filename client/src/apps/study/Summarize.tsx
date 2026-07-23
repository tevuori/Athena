// ===== Study Hub: Summarize =====

import { useState } from "react";
import { Sparkles, FileText, GraduationCap } from "lucide-react";
import SourcePicker from "./SourcePicker";
import { ActionButton, ErrorBanner, Loading, MarkdownView, SuccessBanner, TruncationNote } from "./ui";
import { studyApi, type SourceDescriptor } from "../../services/study";
import { useWindows } from "../../store/windows";

export default function Summarize({ initialSource }: { initialSource?: SourceDescriptor | null }) {
  const [source, setSource] = useState<SourceDescriptor | null>(initialSource ?? null);
  const [mode, setMode] = useState<"tldr" | "outline" | "keypoints">("keypoints");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summary, setSummary] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const openWindow = useWindows((s) => s.open);

  const run = async () => {
    if (!source) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setSummary("");
    setNoteId(null);
    try {
      const res = await studyApi.summarize({ source, mode, saveAsNote: true });
      setSummary(res.summary);
      setNoteId(res.noteId);
      setTruncated(res.truncated);
      if (res.noteId) setSuccess("Saved as a new note.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to summarize");
    } finally {
      setLoading(false);
    }
  };

  const openNote = () => {
    if (!noteId) return;
    openWindow({ appId: "notes", title: "Notes", icon: "StickyNote", payload: { noteId } });
  };

  const studyFurther = (mode: "flashcards" | "quiz" | "explain") => {
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
      <SourcePicker value={source} onChange={setSource} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Style
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="rounded-md border border-edge bg-surface-2 px-2 py-1.5 text-ink outline-none focus:border-accent"
          >
            <option value="keypoints">Key points</option>
            <option value="outline">Outline</option>
            <option value="tldr">TL;DR</option>
          </select>
        </label>
        <ActionButton onClick={run} disabled={!source} loading={loading}>
          <Sparkles size={13} /> Summarize
        </ActionButton>
      </div>

      {loading && <Loading label="Summarizing…" />}
      {error && <ErrorBanner message={error} />}
      <TruncationNote show={truncated} />
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
      {summary && <MarkdownView content={summary} />}
    </div>
  );
}

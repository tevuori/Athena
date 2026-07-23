// ===== Study Hub: Explain =====

import { useState } from "react";
import { Sparkles, FileText, GraduationCap } from "lucide-react";
import SourcePicker from "./SourcePicker";
import { ActionButton, ErrorBanner, Loading, MarkdownView, SuccessBanner, TruncationNote } from "./ui";
import { studyApi, type SourceDescriptor } from "../../services/study";
import { useWindows } from "../../store/windows";

export default function Explain({ initialSource }: { initialSource?: SourceDescriptor | null }) {
  const [source, setSource] = useState<SourceDescriptor | null>(initialSource ?? null);
  const [depth, setDepth] = useState<"eli5" | "standard" | "expert">("standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [explanation, setExplanation] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const openWindow = useWindows((s) => s.open);

  const run = async () => {
    if (!source) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setExplanation("");
    setNoteId(null);
    try {
      const res = await studyApi.explain({ source, depth, saveAsNote: true });
      setExplanation(res.explanation);
      setNoteId(res.noteId);
      setTruncated(res.truncated);
      if (res.noteId) setSuccess("Saved as a new note.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to explain");
    } finally {
      setLoading(false);
    }
  };

  const openNote = () => {
    if (!noteId) return;
    openWindow({ appId: "notes", title: "Notes", icon: "StickyNote", payload: { noteId } });
  };

  const studyFurther = (mode: "flashcards" | "quiz" | "summarize") => {
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
          Depth
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as typeof depth)}
            className="rounded-md border border-edge bg-surface-2 px-2 py-1.5 text-ink outline-none focus:border-accent"
          >
            <option value="eli5">ELI5</option>
            <option value="standard">Standard</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        <ActionButton onClick={run} disabled={!source} loading={loading}>
          <Sparkles size={13} /> Explain
        </ActionButton>
      </div>

      {loading && <Loading label="Explaining…" />}
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
      {explanation && <MarkdownView content={explanation} />}
    </div>
  );
}

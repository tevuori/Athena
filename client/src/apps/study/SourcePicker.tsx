// ===== Shared source picker for Study Hub workflows =====
// Pick a note, a text file, pasted text, or a Moodle course material.
// Returns a SourceDescriptor.

import { useState, useEffect, useMemo } from "react";
import {
  StickyNote, FileText, ClipboardPaste, Search, GraduationCap,
  ChevronRight, ArrowLeft, Loader2, AlertCircle, File, Link2, FileCode,
  ListChecks, Folder as FolderIcon,
} from "lucide-react";
import { notesApi } from "../../services/notes";
import { filesApi } from "../../services/files";
import { moodleApi } from "../../services/moodle";
import type { Note, VFile } from "../../types";
import type { MoodleCourse, MoodleCourseContents, MoodleActivity } from "../../services/moodle";
import type { SourceDescriptor, SourceKind } from "../../services/study";

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "html", "htm", "css", "xml", "svg", "py",
  "rb", "php", "go", "rs", "java", "c", "h", "cpp", "cs", "kt", "swift", "sh",
  "bash", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "sql", "csv",
  "tsv", "log", "js", "jsx", "ts", "tsx",
]);

function isTextFile(f: VFile): boolean {
  if (f.mimeType.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(f.mimeType)) return true;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXT.has(ext);
}

const ACTIVITY_ICONS: Record<string, typeof File> = {
  resource: File,
  page: FileText,
  url: Link2,
  assign: ListChecks,
  folder: FolderIcon,
  book: FileText,
  lesson: FileText,
  quiz: FileCode,
};

export interface SourcePickerProps {
  value: SourceDescriptor | null;
  onChange: (src: SourceDescriptor | null) => void;
  /** Hide the paste option (e.g. for study-guide which uses note multi-select). */
  hidePaste?: boolean;
}

export default function SourcePicker({ value, onChange, hidePaste }: SourcePickerProps) {
  const [kind, setKind] = useState<SourceKind>(value?.kind ?? "note");
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<VFile[]>([]);
  const [noteQuery, setNoteQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [pasteText, setPasteText] = useState(value?.kind === "paste" ? value.text ?? "" : "");
  const [selectedNoteId, setSelectedNoteId] = useState(value?.kind === "note" ? value.id ?? "" : "");
  const [selectedFileId, setSelectedFileId] = useState(value?.kind === "file" ? value.id ?? "" : "");
  const [loading, setLoading] = useState(false);

  // Moodle state
  const [moodleStatus, setMoodleStatus] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [moodleCourses, setMoodleCourses] = useState<MoodleCourse[]>([]);
  const [moodleContents, setMoodleContents] = useState<MoodleCourseContents | null>(null);
  const [moodleLoading, setMoodleLoading] = useState(false);
  const [moodleError, setMoodleError] = useState("");
  const [selectedMoodleUrl, setSelectedMoodleUrl] = useState(value?.kind === "moodle" ? value.url ?? "" : "");
  const [selectedMoodleName, setSelectedMoodleName] = useState(value?.kind === "moodle" ? value.name ?? "" : "");

  useEffect(() => {
    if (kind === "note" && notes.length === 0) {
      setLoading(true);
      notesApi.list().then((r) => setNotes(r.notes)).finally(() => setLoading(false));
    }
    if (kind === "file" && files.length === 0) {
      setLoading(true);
      filesApi.all().then((r) => setFiles(r.files.filter(isTextFile))).finally(() => setLoading(false));
    }
    if (kind === "moodle" && !moodleStatus) {
      moodleApi.status().then(setMoodleStatus).catch(() => setMoodleStatus({ configured: false, authenticated: false }));
    }
  }, [kind, notes.length, files.length, moodleStatus]);

  // Emit the current selection up.
  useEffect(() => {
    if (kind === "paste") {
      if (pasteText.trim()) onChange({ kind: "paste", text: pasteText });
      else onChange(null);
    } else if (kind === "note") {
      if (selectedNoteId) onChange({ kind: "note", id: selectedNoteId });
      else onChange(null);
    } else if (kind === "file") {
      if (selectedFileId) onChange({ kind: "file", id: selectedFileId });
      else onChange(null);
    } else if (kind === "moodle") {
      if (selectedMoodleUrl) onChange({ kind: "moodle", url: selectedMoodleUrl, name: selectedMoodleName });
      else onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, pasteText, selectedNoteId, selectedFileId, selectedMoodleUrl, selectedMoodleName]);

  const filteredNotes = useMemo(() => {
    if (!noteQuery.trim()) return notes;
    const q = noteQuery.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, noteQuery]);

  const filteredFiles = useMemo(() => {
    if (!fileQuery.trim()) return files;
    const q = fileQuery.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, fileQuery]);

  // ===== Moodle handlers =====
  const loadMoodleCourses = async () => {
    setMoodleLoading(true);
    setMoodleError("");
    try {
      // If not authenticated, try logging in first.
      if (moodleStatus && !moodleStatus.authenticated) {
        await moodleApi.login();
      }
      const { courses } = await moodleApi.courses();
      setMoodleCourses(courses);
    } catch (e) {
      setMoodleError(e instanceof Error ? e.message : "Failed to load Moodle courses");
    } finally {
      setMoodleLoading(false);
    }
  };

  const loadCourseContents = async (courseId: string) => {
    setMoodleLoading(true);
    setMoodleError("");
    try {
      const contents = await moodleApi.courseContents(courseId);
      setMoodleContents(contents);
    } catch (e) {
      setMoodleError(e instanceof Error ? e.message : "Failed to load course contents");
    } finally {
      setMoodleLoading(false);
    }
  };

  const selectMoodleActivity = (act: MoodleActivity) => {
    if (!act.fetchable) return;
    setSelectedMoodleUrl(act.url);
    setSelectedMoodleName(act.name);
  };

  const tabs: { k: SourceKind; label: string; icon: typeof StickyNote }[] = [
    { k: "note", label: "Note", icon: StickyNote },
    { k: "file", label: "File", icon: FileText },
    ...(!hidePaste ? [{ k: "paste" as SourceKind, label: "Paste", icon: ClipboardPaste }] : []),
    { k: "moodle", label: "Moodle", icon: GraduationCap },
  ];

  return (
    <div className="rounded-lg border border-edge bg-surface-2 p-3">
      <div className="mb-2 flex gap-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = kind === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setKind(t.k)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                active ? "bg-accent text-accent-fg" : "text-ink-muted hover:bg-surface-3 hover:text-ink"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {kind === "note" && (
        <div>
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-md border border-edge bg-surface px-7 py-1.5 text-xs text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-edge bg-surface">
            {loading ? (
              <div className="p-2 text-xs text-ink-muted">Loading…</div>
            ) : filteredNotes.length === 0 ? (
              <div className="p-2 text-xs text-ink-muted">No notes found.</div>
            ) : (
              filteredNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSelectedNoteId(n.id)}
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-surface-2 ${
                    selectedNoteId === n.id ? "bg-surface-2 text-accent" : "text-ink"
                  }`}
                >
                  <span className="truncate">{n.title || "Untitled"}</span>
                  {n.pinned && <span className="text-accent">★</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {kind === "file" && (
        <div>
          <div className="relative mb-2">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={fileQuery}
              onChange={(e) => setFileQuery(e.target.value)}
              placeholder="Search text files…"
              className="w-full rounded-md border border-edge bg-surface px-7 py-1.5 text-xs text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-edge bg-surface">
            {loading ? (
              <div className="p-2 text-xs text-ink-muted">Loading…</div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-2 text-xs text-ink-muted">No text files found.</div>
            ) : (
              filteredFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFileId(f.id)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-surface-2 ${
                    selectedFileId === f.id ? "bg-surface-2 text-accent" : "text-ink"
                  }`}
                >
                  <FileText size={12} className="shrink-0 text-ink-muted" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {kind === "paste" && (
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste your study material here…"
          rows={6}
          className="w-full resize-y rounded-md border border-edge bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
        />
      )}

      {kind === "moodle" && (
        <MoodlePicker
          status={moodleStatus}
          courses={moodleCourses}
          contents={moodleContents}
          loading={moodleLoading}
          error={moodleError}
          selectedUrl={selectedMoodleUrl}
          onLoadCourses={loadMoodleCourses}
          onOpenCourse={loadCourseContents}
          onSelectActivity={selectMoodleActivity}
          onBack={() => setMoodleContents(null)}
          onClearSelection={() => { setSelectedMoodleUrl(""); setSelectedMoodleName(""); }}
        />
      )}
    </div>
  );
}

// ===== Moodle picker sub-component =====

function MoodlePicker({
  status,
  courses,
  contents,
  loading,
  error,
  selectedUrl,
  onLoadCourses,
  onOpenCourse,
  onSelectActivity,
  onBack,
  onClearSelection,
}: {
  status: { configured: boolean; authenticated: boolean } | null;
  courses: MoodleCourse[];
  contents: MoodleCourseContents | null;
  loading: boolean;
  error: string;
  selectedUrl: string;
  onLoadCourses: () => void;
  onOpenCourse: (courseId: string) => void;
  onSelectActivity: (act: MoodleActivity) => void;
  onBack: () => void;
  onClearSelection: () => void;
}) {
  // Not configured — show a hint to set up VUT credentials first.
  if (status && !status.configured) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
        <div className="flex items-center gap-1.5 font-medium">
          <AlertCircle size={13} /> VUT credentials not configured
        </div>
        <p className="mt-1 text-amber-500/80">
          Open the VUT app and log in with your VUT credentials (id.vut.cz) first.
          Moodle uses the same SSO login.
        </p>
      </div>
    );
  }

  // No courses loaded yet — show a "Load courses" button.
  if (!contents && courses.length === 0 && !loading && !error) {
    return (
      <button
        onClick={onLoadCourses}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-edge bg-surface py-2.5 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
      >
        <GraduationCap size={14} /> Load my Moodle courses
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-edge bg-surface p-3 text-xs text-ink-muted">
        <Loader2 size={14} className="animate-spin text-accent" /> Loading from Moodle…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
          <AlertCircle size={13} /> {error}
        </div>
        <button
          onClick={onLoadCourses}
          className="flex items-center justify-center gap-1.5 rounded-md border border-edge bg-surface py-2 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  // Selected resource — show it with a change button.
  if (selectedUrl && !contents) {
    return (
      <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
        <span className="truncate text-emerald-500">
          <FileText size={12} className="mr-1 inline" />
          {selectedUrl.split("/").pop()?.split("?")[0] ?? "Moodle resource"}
        </span>
        <button
          onClick={onClearSelection}
          className="shrink-0 text-ink-muted hover:text-ink"
        >
          Change
        </button>
      </div>
    );
  }

  // Course list view
  if (!contents) {
    return (
      <div className="max-h-64 overflow-y-auto rounded-md border border-edge bg-surface">
        {courses.length === 0 ? (
          <div className="p-3 text-xs text-ink-muted">No courses found.</div>
        ) : (
          courses.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenCourse(c.id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs text-ink hover:bg-surface-2"
            >
              <GraduationCap size={13} className="shrink-0 text-ink-muted" />
              <span className="truncate flex-1">{c.name}</span>
              <ChevronRight size={13} className="shrink-0 text-ink-muted" />
            </button>
          ))
        )}
      </div>
    );
  }

  // Course contents view (sections + activities)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3 hover:text-ink"
        >
          <ArrowLeft size={12} /> Courses
        </button>
        <span className="truncate text-xs font-medium text-ink">{contents.courseName}</span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-edge bg-surface">
        {contents.sections.length === 0 ? (
          <div className="p-3 text-xs text-ink-muted">No materials found in this course.</div>
        ) : (
          contents.sections.map((section, si) => (
            <div key={si}>
              <div className="border-b border-edge bg-surface-2 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                {section.name}
              </div>
              {section.activities.map((act) => {
                const Icon = ACTIVITY_ICONS[act.modType] ?? File;
                const selected = selectedUrl === act.url;
                return (
                  <button
                    key={act.id}
                    onClick={() => onSelectActivity(act)}
                    disabled={!act.fetchable}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                      selected
                        ? "bg-accent/10 text-accent"
                        : act.fetchable
                        ? "text-ink hover:bg-surface-2"
                        : "text-ink-muted/50 cursor-not-allowed"
                    }`}
                  >
                    <Icon size={12} className="shrink-0 opacity-60" />
                    <span className="truncate flex-1">{act.name}</span>
                    <span className="shrink-0 text-[9px] uppercase opacity-50">{act.typeLabel}</span>
                    {selected && <span className="shrink-0 text-accent">✓</span>}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
      {selectedUrl && (
        <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-500">
          <span className="truncate">Selected material ready</span>
          <button onClick={onClearSelection} className="shrink-0 hover:underline">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

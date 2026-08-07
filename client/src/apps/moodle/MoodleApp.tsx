// ===== Moodle app =====
// Browse enrolled Moodle courses, view materials + assignments, sync a course
// into Tasks/Calendar/Files, and trigger Study Hub workflows (summarize,
// flashcards) from a Moodle document in one click. Reuses the VUT SSO session.

import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap, Loader2, AlertCircle, ArrowLeft, ChevronRight, RefreshCw,
  FileText, Link2, ListChecks, Folder as FolderIcon, File, FileCode, BookOpen,
  Brain, Sparkles, Calendar, CheckSquare, Trash2, ExternalLink, Clock, Lock,
} from "lucide-react";
import { moodleApi } from "../../services/moodle";
import type {
  MoodleCourse, MoodleCourseContents, MoodleActivity,
  MoodleAssignment, MoodleSyncState, MoodleSyncResult,
} from "../../services/moodle";
import { useWindows } from "../../store/windows";
import { useFeatures } from "../../store/features";
import type { WindowInstance } from "../../store/windows";

const ACTIVITY_ICONS: Record<string, typeof File> = {
  resource: File,
  page: FileText,
  url: Link2,
  assign: ListChecks,
  folder: FolderIcon,
  book: BookOpen,
  lesson: FileText,
  quiz: FileCode,
};

function formatDate(iso?: string): string {
  if (!iso) return "No due date";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "No due date";
  const now = new Date();
  const overdue = d < now;
  const str = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return overdue ? `Overdue — ${str}` : str;
}

function isOverdue(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export default function MoodleApp({ win }: { win: WindowInstance }) {
  const openWindow = useWindows((s) => s.open);
  const vutGranted = useFeatures((s) => s.vutGranted);
  const [status, setStatus] = useState<{ configured: boolean; authenticated: boolean; username?: string } | null>(null);
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [contents, setContents] = useState<MoodleCourseContents | null>(null);
  const [assignments, setAssignments] = useState<MoodleAssignment[] | null>(null);
  const [synced, setSynced] = useState<MoodleSyncState[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activeCourse, setActiveCourse] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<"materials" | "assignments" | "sync">("materials");
  const [toast, setToast] = useState<string>("");

  const loadStatus = useCallback(async () => {
    const res = await moodleApi.status().catch(() => null);
    setStatus(res ?? { configured: false, authenticated: false });
  }, []);

  const loadSynced = useCallback(async () => {
    try {
      const { synced } = await moodleApi.syncStatus();
      setSynced(synced);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadStatus(); void loadSynced(); }, [loadStatus, loadSynced]);

  const loadCourses = async () => {
    setLoading(true);
    setError("");
    try {
      if (status && !status.authenticated) {
        await moodleApi.login();
        await loadStatus();
      }
      const { courses } = await moodleApi.courses();
      setCourses(courses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Moodle courses");
    } finally {
      setLoading(false);
    }
  };

  const openCourse = async (course: MoodleCourse) => {
    setActiveCourse({ id: course.id, name: course.name });
    setContents(null);
    setAssignments(null);
    setTab("materials");
    setLoading(true);
    setError("");
    try {
      const c = await moodleApi.courseContents(course.id);
      setContents(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load course contents");
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (courseId: string) => {
    setLoading(true);
    setError("");
    try {
      const { assignments } = await moodleApi.assignments(courseId);
      setAssignments(assignments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  const syncCourse = async (courseId: string, courseName: string) => {
    setSyncing(courseId);
    setError("");
    try {
      const result: MoodleSyncResult = await moodleApi.syncCourse(courseId);
      setToast(
        `Synced "${courseName}": ${result.tasksCreated} task(s), ${result.eventsCreated} calendar event(s), ${result.filesCreated} file(s).` +
        (result.skippedNoDueDate ? ` ${result.skippedNoDueDate} assignment(s) skipped (no due date).` : "")
      );
      void loadSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const desync = async (courseId: string) => {
    if (!confirm("Remove all synced tasks, calendar events, and files for this course?")) return;
    setSyncing(courseId);
    try {
      await moodleApi.desyncCourse(courseId);
      setToast("Course unsynced — synced rows removed.");
      void loadSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Desync failed");
    } finally {
      setSyncing(null);
    }
  };

  // One-click Study Hub action from a Moodle material.
  const studyFromMaterial = (act: MoodleActivity, mode: "summarize" | "flashcards" | "quiz" | "explain") => {
    openWindow({
      appId: "study",
      title: "Study Hub",
      icon: "GraduationCap",
      payload: { mode, sourceKind: "moodle", sourceUrl: act.url, sourceName: act.name },
    });
  };

  // Open a Moodle material's underlying virtual file in the Viewer (if synced).
  const openInViewer = (act: MoodleActivity) => {
    // The virtual file is keyed by sourceRef "courseId:activityId"; we don't have
    // the file id here, so open the Files app at the Moodle folder instead.
    openWindow({ appId: "files", title: "Files", icon: "Folder", payload: { search: act.name } });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ----- Locked (admin grant revoked) -----
  if (!vutGranted) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <Lock size={28} />
        </div>
        <h2 className="text-lg font-semibold text-ink">Moodle is not enabled</h2>
        <p className="max-w-sm text-sm text-ink-muted">
          Moodle access requires VUT integration, which an administrator must enable for your account.
        </p>
      </div>
    );
  }

  // ----- Not configured -----
  if (status && !status.configured) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle size={16} /> VUT credentials not configured
          </div>
          <p className="mt-2 text-amber-500/80">
            Moodle logs in through your VUT account (id.vut.cz SSO). Open the VUT app and
            log in with your VUT credentials first — Moodle will reuse that session.
          </p>
        </div>
      </div>
    );
  }

  const isSynced = (courseId: string) => synced.some((s) => s.courseId === courseId);
  const syncState = (courseId: string) => synced.find((s) => s.courseId === courseId);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
        {activeCourse ? (
          <button
            onClick={() => { setActiveCourse(null); setContents(null); setAssignments(null); setError(""); }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
          >
            <ArrowLeft size={14} /> Courses
          </button>
        ) : (
          <GraduationCap size={16} className="text-accent" />
        )}
        <span className="truncate text-sm font-semibold text-ink">
          {activeCourse ? activeCourse.name : "Moodle"}
        </span>
        {!activeCourse && status?.authenticated && (
          <button
            onClick={loadCourses}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
        {activeCourse && (
          <div className="ml-auto flex items-center gap-1">
            {(["materials", "assignments", "sync"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "assignments" && assignments === null) void loadAssignments(activeCourse.id);
                }}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                  tab === t ? "bg-accent text-accent-fg" : "text-ink-muted hover:bg-surface-3 hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertCircle size={13} /> {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400/60 hover:text-red-400">×</button>
          </div>
        )}

        {/* Course list */}
        {!activeCourse && (
          <>
            {!status?.authenticated && !loading && courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <GraduationCap size={32} className="text-ink-muted/40" />
                <p className="text-sm text-ink-muted">Connect to Moodle to browse your courses.</p>
                <button
                  onClick={loadCourses}
                  className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-medium text-accent-fg hover:opacity-90"
                >
                  <GraduationCap size={14} /> Load my courses
                </button>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
                <Loader2 size={16} className="animate-spin text-accent" /> Loading…
              </div>
            ) : (
              <div className="grid gap-2 @2xl:grid-cols-2">
                {courses.map((c) => {
                  const s = syncState(c.id);
                  return (
                    <div key={c.id} className="flex flex-col rounded-lg border border-edge bg-surface-2 p-3">
                      <button
                        onClick={() => openCourse(c)}
                        className="flex items-center gap-2 text-left"
                      >
                        <GraduationCap size={14} className="shrink-0 text-ink-muted" />
                        <span className="truncate text-sm font-medium text-ink hover:text-accent">{c.name}</span>
                        <ChevronRight size={14} className="ml-auto shrink-0 text-ink-muted" />
                      </button>
                      {s && (
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-muted">
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-500">Synced</span>
                          <span>{s.assignmentCount} assignments · {s.materialCount} materials</span>
                          <span className="ml-auto">
                            {new Date(s.lastSyncAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <div className="mt-2 flex gap-1.5">
                        <button
                          onClick={() => syncCourse(c.id, c.name)}
                          disabled={syncing === c.id}
                          className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3 hover:text-ink disabled:opacity-50"
                        >
                          {syncing === c.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                          {isSynced(c.id) ? "Re-sync" : "Sync"}
                        </button>
                        {isSynced(c.id) && (
                          <button
                            onClick={() => desync(c.id)}
                            disabled={syncing === c.id}
                            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          >
                            <Trash2 size={11} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Course view */}
        {activeCourse && tab === "materials" && (
          <>
            {loading && !contents ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
                <Loader2 size={16} className="animate-spin text-accent" /> Loading materials…
              </div>
            ) : contents ? (
              contents.sections.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">No materials found in this course.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {contents.sections.map((section, si) => (
                    <div key={si} className="rounded-lg border border-edge bg-surface-2">
                      <div className="border-b border-edge px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                        {section.name}
                      </div>
                      {section.activities.map((act) => {
                        const Icon = ACTIVITY_ICONS[act.modType] ?? File;
                        return (
                          <div
                            key={act.id}
                            className="group flex items-center gap-2 border-b border-edge/50 px-3 py-2 last:border-0"
                          >
                            <Icon size={14} className="shrink-0 opacity-60" />
                            <span className="truncate text-sm text-ink">{act.name}</span>
                            <span className="shrink-0 text-[9px] uppercase opacity-50">{act.typeLabel}</span>
                            {act.dueDate && (
                              <span className={`shrink-0 text-[10px] ${isOverdue(act.dueDate) ? "text-red-400" : "text-ink-muted"}`}>
                                <Clock size={10} className="mr-0.5 inline" />{formatDate(act.dueDate)}
                              </span>
                            )}
                            <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                              {act.fetchable && (
                                <>
                                  <button
                                    onClick={() => studyFromMaterial(act, "summarize")}
                                    title="Summarize in Study Hub"
                                    className="rounded p-1 text-ink-muted hover:bg-surface-3 hover:text-accent"
                                  >
                                    <Sparkles size={13} />
                                  </button>
                                  <button
                                    onClick={() => studyFromMaterial(act, "flashcards")}
                                    title="Make flashcards in Study Hub"
                                    className="rounded p-1 text-ink-muted hover:bg-surface-3 hover:text-accent"
                                  >
                                    <Brain size={13} />
                                  </button>
                                </>
                              )}
                              <a
                                href={act.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open in Moodle"
                                className="rounded p-1 text-ink-muted hover:bg-surface-3 hover:text-ink"
                              >
                                <ExternalLink size={13} />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </>
        )}

        {activeCourse && tab === "assignments" && (
          <>
            {loading && assignments === null ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
                <Loader2 size={16} className="animate-spin text-accent" /> Loading assignments…
              </div>
            ) : assignments === null ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <ListChecks size={28} className="text-ink-muted/40" />
                <button
                  onClick={() => loadAssignments(activeCourse.id)}
                  className="rounded-md border border-edge px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
                >
                  Load assignments
                </button>
              </div>
            ) : assignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">No assignments found in this course.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {assignments.map((a) => {
                  const overdue = isOverdue(a.dueDate);
                  return (
                    <div key={a.id} className="rounded-lg border border-edge bg-surface-2 p-3">
                      <div className="flex items-center gap-2">
                        <ListChecks size={14} className="shrink-0 text-ink-muted" />
                        <span className="truncate text-sm font-medium text-ink">{a.name}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <Clock size={11} className={overdue ? "text-red-400" : "text-ink-muted"} />
                        <span className={overdue ? "text-red-400" : "text-ink-muted"}>{formatDate(a.dueDate)}</span>
                      </div>
                      {a.description && (
                        <p className="mt-1.5 line-clamp-2 text-[11px] text-ink-muted">{a.description}</p>
                      )}
                      <div className="mt-2 flex gap-1.5">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3 hover:text-ink"
                        >
                          <ExternalLink size={11} /> Open
                        </a>
                        <button
                          onClick={() => studyFromMaterial({ ...a, modType: "assign", typeLabel: "Assignment", fetchable: true }, "summarize")}
                          className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-3 hover:text-accent"
                        >
                          <Sparkles size={11} /> Summarize
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeCourse && tab === "sync" && (
          <SyncPanel
            courseId={activeCourse.id}
            courseName={activeCourse.name}
            syncing={syncing === activeCourse.id}
            syncState={syncState(activeCourse.id)}
            onSync={() => syncCourse(activeCourse.id, activeCourse.name)}
            onDesync={() => desync(activeCourse.id)}
            onOpenFiles={() => openWindow({ appId: "files", title: "Files", icon: "Folder", payload: { folderName: "Moodle" } })}
            onOpenCalendar={() => openWindow({ appId: "calendar", title: "Calendar", icon: "Calendar" })}
            onOpenTasks={() => openWindow({ appId: "tasks", title: "Tasks", icon: "CheckSquare" })}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function SyncPanel({
  courseId, courseName, syncing, syncState, onSync, onDesync, onOpenFiles, onOpenCalendar, onOpenTasks,
}: {
  courseId: string;
  courseName: string;
  syncing: boolean;
  syncState?: MoodleSyncState;
  onSync: () => void;
  onDesync: () => void;
  onOpenFiles: () => void;
  onOpenCalendar: () => void;
  onOpenTasks: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-lg border border-edge bg-surface-2 p-4">
        <h3 className="text-sm font-semibold text-ink">Sync "{courseName}"</h3>
        <p className="mt-1.5 text-xs text-ink-muted">
          Syncing pulls assignment deadlines into Tasks + Calendar and surfaces
          course materials as virtual files in the File Manager (under
          <span className="font-mono"> Moodle / {courseName}</span>). Re-syncing
          updates existing rows without duplicating them.
        </p>
        {syncState ? (
          <div className="mt-3 space-y-1 text-xs text-ink-muted">
            <div className="flex justify-between"><span>Last sync</span><span>{new Date(syncState.lastSyncAt).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Assignments</span><span>{syncState.assignmentCount}</span></div>
            <div className="flex justify-between"><span>Materials</span><span>{syncState.materialCount}</span></div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-muted">Not synced yet.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncState ? "Re-sync" : "Sync course"}
          </button>
          {syncState && (
            <button
              onClick={onDesync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
            >
              <Trash2 size={12} /> Remove sync
            </button>
          )}
        </div>
      </div>

      {syncState && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={onOpenTasks} className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface-2 p-3 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink">
            <CheckSquare size={18} className="text-accent" /> Tasks
          </button>
          <button onClick={onOpenCalendar} className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface-2 p-3 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink">
            <Calendar size={18} className="text-accent" /> Calendar
          </button>
          <button onClick={onOpenFiles} className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-surface-2 p-3 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink">
            <FolderIcon size={18} className="text-accent" /> Files
          </button>
        </div>
      )}
    </div>
  );
}

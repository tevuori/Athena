import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Lock, LogOut, RefreshCw, ExternalLink, Calendar,
  Bell, BookOpen, Globe, ChevronRight, Download, AlertCircle, CheckCircle2,
  Clock, MapPin, User,
} from "lucide-react";
import { vutApi } from "../../services/vut";
import { gradesApi } from "../../services/grades";
import { useFormFactor } from "../../store/formfactor";
import type { VutGrade, VutTimetableSlot, VutSubjectUpdate } from "../../types";

type Tab = "overview" | "grades" | "timetable" | "updates" | "webview";
type AuthState = "loading" | "login" | "connected" | "error";

const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAYS_FULL = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

const SLOT_COLORS = [
  "#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#8b5cf6", "#ef4444",
  "#3b82f6", "#10b981", "#f97316",
];

function colorForCourse(code: string, index: number): string {
  return SLOT_COLORS[index % SLOT_COLORS.length];
}

export default function VUTApp() {
  const isPhone = useFormFactor((s) => s.mode === "phone");
  const [tab, setTab] = useState<Tab>("overview");
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [username, setUsername] = useState("");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  // Data
  const [grades, setGrades] = useState<VutGrade[]>([]);
  const [gradesSemesters, setGradesSemesters] = useState<string[]>([]);
  const [timetable, setTimetable] = useState<VutTimetableSlot[]>([]);
  const [updates, setUpdates] = useState<VutSubjectUpdate[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const { configured, username: uname, authenticated } = await vutApi.status();
      if (configured && uname) {
        setUsername(uname);
        setAuthState(authenticated ? "connected" : "connected");
      } else {
        setAuthState("login");
      }
    } catch {
      setAuthState("login");
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const doLogin = async () => {
    if (!loginUser.trim() || !loginPass.trim()) return;
    setLoading(true);
    setLoginError("");
    try {
      await vutApi.login(loginUser, loginPass);
      setUsername(loginUser);
      setAuthState("connected");
      setLoginUser("");
      setLoginPass("");
      // Auto-load data
      loadAllData();
    } catch (e) {
      setLoginError((e as Error).message || "Login failed");
      setAuthState("error");
    } finally {
      setLoading(false);
    }
  };

  const doLogout = async () => {
    await vutApi.deleteCredentials();
    setAuthState("login");
    setUsername("");
    setGrades([]);
    setTimetable([]);
    setUpdates([]);
  };

  const loadAllData = async () => {
    setLoading(true);
    setDataError(null);
    try {
      await Promise.all([loadGrades(), loadTimetable(), loadUpdates()]);
    } catch (e) {
      setDataError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadGrades = async () => {
    try {
      const { grades, semesters } = await vutApi.grades();
      setGrades(grades);
      setGradesSemesters(semesters);
    } catch (e) { setDataError((e as Error).message); }
  };

  const loadTimetable = async () => {
    try {
      const { slots } = await vutApi.timetable();
      setTimetable(slots);
    } catch (e) { setDataError((e as Error).message); }
  };

  const loadUpdates = async () => {
    try {
      const { updates } = await vutApi.updates();
      setUpdates(updates);
    } catch (e) { setDataError((e as Error).message); }
  };

  useEffect(() => {
    if (authState === "connected" && grades.length === 0 && timetable.length === 0 && updates.length === 0) {
      loadAllData();
    }
  }, [authState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Login Screen =====
  if (authState === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <RefreshCw size={24} className="animate-spin text-ink-muted" />
      </div>
    );
  }

  if (authState === "login" || authState === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-surface to-surface-2 p-8">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15">
            <GraduationCap size={32} className="text-accent" />
          </div>
          <h2 className="text-lg font-bold text-ink">Connect to VUT</h2>
          <p className="mt-1 text-center text-sm text-ink-muted">
            Sign in with your VUT credentials (id.vut.cz) to sync grades, timetable, and subject updates.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          <input
            autoFocus
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            placeholder="VUT username (e.g. xnovak00)"
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          <input
            type="password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doLogin()}
            placeholder="Password"
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          {loginError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle size={14} /> {loginError}
            </div>
          )}
          <button
            onClick={doLogin}
            disabled={loading || !loginUser || !loginPass}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Lock size={16} />}
            {loading ? "Connecting..." : "Connect"}
          </button>
          <p className="text-center text-[11px] text-ink-muted">
            Credentials are encrypted and stored locally on your device.
          </p>
        </div>
      </div>
    );
  }

  // ===== Main App (Connected) =====
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1; // Convert Sunday=0 to our format
  const todayClasses = timetable
    .filter((s) => s.dayIndex === todayIndex)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-accent" />
          <span className="text-sm font-semibold text-ink">VUT Studis</span>
          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">
            {username}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={loadAllData}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted transition hover:bg-surface-3 hover:text-ink"
            title="Refresh all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={doLogout}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted transition hover:bg-surface-3 hover:text-red-400"
            title="Disconnect"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-edge bg-surface-2 px-2">
        {([
          { id: "overview", label: "Overview", icon: <GraduationCap size={14} /> },
          { id: "grades", label: "Grades", icon: <BookOpen size={14} /> },
          { id: "timetable", label: "Timetable", icon: <Calendar size={14} /> },
          { id: "updates", label: "Updates", icon: <Bell size={14} /> },
          { id: "webview", label: "Web View", icon: <Globe size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {dataError && (
          <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            <AlertCircle size={14} /> {dataError}
          </div>
        )}

        {/* ===== Overview Tab ===== */}
        {tab === "overview" && (
          <div className="space-y-4 p-4">
            {/* Today's classes */}
            <div className="rounded-xl border border-edge bg-surface-2 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock size={16} className="text-accent" />
                Today's Schedule
                <span className="text-xs font-normal text-ink-muted">({DAYS_FULL[todayIndex]})</span>
              </h3>
              {todayClasses.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">No classes today 🎉</p>
              ) : (
                <div className="space-y-2">
                  {todayClasses.map((slot, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-surface p-3">
                      <div className="h-10 w-1 rounded-full" style={{ backgroundColor: colorForCourse(slot.courseCode, i) }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{slot.courseName}</p>
                        <div className="flex items-center gap-3 text-xs text-ink-muted">
                          <span className="flex items-center gap-1"><Clock size={11} /> {slot.startTime}–{slot.endTime}</span>
                          {slot.room && <span className="flex items-center gap-1"><MapPin size={11} /> {slot.room}</span>}
                          {slot.type && <span>{slot.type}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
              <div className="rounded-xl border border-edge bg-surface-2 p-4 text-center">
                <p className="text-2xl font-bold text-ink">{grades.length}</p>
                <p className="text-xs text-ink-muted">Graded Courses</p>
              </div>
              <div className="rounded-xl border border-edge bg-surface-2 p-4 text-center">
                <p className="text-2xl font-bold text-ink">{timetable.length}</p>
                <p className="text-xs text-ink-muted">Weekly Classes</p>
              </div>
              <div className="rounded-xl border border-edge bg-surface-2 p-4 text-center">
                <p className="text-2xl font-bold text-ink">{updates.length}</p>
                <p className="text-xs text-ink-muted">Updates</p>
              </div>
            </div>

            {/* Recent updates */}
            {updates.length > 0 && (
              <div className="rounded-xl border border-edge bg-surface-2 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Bell size={16} className="text-accent" /> Recent Subject Updates
                </h3>
                <div className="space-y-2">
                  {updates.slice(0, 5).map((u, i) => (
                    <div key={i} className="rounded-lg bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium text-ink">{u.title}</p>
                        {u.date && <span className="shrink-0 text-xs text-ink-muted">{u.date}</span>}
                      </div>
                      {u.subjectName && <p className="text-xs text-ink-muted">{u.subjectName}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="rounded-xl border border-edge bg-surface-2 p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Quick Links</h3>
              <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
                {[
                  { label: "id.vut.cz", url: "https://id.vut.cz", sn: "" },
                  { label: "Grades", url: "", sn: "el_index" },
                  { label: "Timetable", url: "", sn: "osobni_rozvrh" },
                  { label: "Subject Updates", url: "", sn: "aktuality_predmet" },
                ].map((link) => (
                  <button
                    key={link.label}
                    onClick={() => {
                      setTab("webview");
                    }}
                    className="flex items-center justify-between rounded-lg bg-surface p-3 text-sm text-ink transition hover:bg-surface-3"
                  >
                    {link.label}
                    <ChevronRight size={14} className="text-ink-muted" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== Grades Tab ===== */}
        {tab === "grades" && (
          <div className="p-4">
            {gradesSemesters.length > 0 && (
              <p className="mb-3 text-sm text-ink-muted">
                {gradesSemesters.length} semester{gradesSemesters.length > 1 ? "s" : ""}:{" "}
                <span className="font-medium text-ink">{gradesSemesters.join(" · ")}</span>
              </p>
            )}
            {grades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <BookOpen size={48} className="mb-3 text-ink-muted opacity-40" />
                <p className="text-sm text-ink-muted">No grades found, or still loading...</p>
                <button onClick={loadGrades} className="mt-3 flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs text-white">
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex justify-end">
                  <button
                    onClick={() => importGradesToTracker(grades, gradesSemesters)}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700"
                  >
                    <Download size={14} /> Import to Grade Tracker
                  </button>
                </div>
                {isPhone ? (
                  /* Mobile: card list */
                  <div className="space-y-2">
                    {grades.map((g, i) => (
                      <div key={i} className="rounded-lg border border-edge bg-surface-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">{g.courseName}</p>
                            <p className="text-xs text-ink-muted">{g.courseCode} · {g.credits} cr</p>
                          </div>
                          <span className={`text-lg font-bold ${gradeColor(g.grade)}`}>{g.grade || "—"}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
                          <span>{g.completionType}</span>
                          {g.score && <span>Score: {g.score}</span>}
                          {g.attempt && <span>Attempt: {g.attempt}</span>}
                          <span>{g.semester}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Desktop: table */
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-edge text-left text-xs text-ink-muted">
                          <th className="py-2 pr-3 font-medium">Code</th>
                          <th className="py-2 pr-3 font-medium">Course</th>
                          <th className="py-2 pr-3 font-medium">Cr.</th>
                          <th className="py-2 pr-3 font-medium">Type</th>
                          <th className="py-2 pr-3 font-medium">Completion</th>
                          <th className="py-2 pr-3 font-medium">Score</th>
                          <th className="py-2 pr-3 font-medium">Grade</th>
                          <th className="py-2 pr-3 font-medium">Attempt</th>
                          <th className="py-2 pr-3 font-medium">Semester</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grades.map((g, i) => (
                          <tr key={i} className="border-b border-edge/50 hover:bg-surface-2">
                            <td className="py-2 pr-3 font-medium text-ink">{g.courseCode}</td>
                            <td className="py-2 pr-3 text-ink">{g.courseName}</td>
                            <td className="py-2 pr-3 text-ink-muted">{g.credits}</td>
                            <td className="py-2 pr-3 text-ink-muted">{g.completionType}</td>
                            <td className="py-2 pr-3 text-ink-muted">{g.completionType}</td>
                            <td className="py-2 pr-3 text-ink-muted">{g.score || "—"}</td>
                            <td className="py-2 pr-3">
                              <span className={`font-bold ${gradeColor(g.grade)}`}>{g.grade || "—"}</span>
                            </td>
                            <td className="py-2 pr-3 text-ink-muted">{g.attempt || "—"}</td>
                            <td className="py-2 pr-3 text-xs text-ink-muted">{g.semester}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== Timetable Tab ===== */}
        {tab === "timetable" && (
          <div className="p-4">
            {timetable.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Calendar size={48} className="mb-3 text-ink-muted opacity-40" />
                <p className="text-sm text-ink-muted">No timetable data found, or still loading...</p>
                <button onClick={loadTimetable} className="mt-3 flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs text-white">
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            ) : (
              <TimetableGrid slots={timetable} />
            )}
          </div>
        )}

        {/* ===== Updates Tab ===== */}
        {tab === "updates" && (
          <div className="p-4">
            {updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Bell size={48} className="mb-3 text-ink-muted opacity-40" />
                <p className="text-sm text-ink-muted">No subject updates found, or still loading...</p>
                <button onClick={loadUpdates} className="mt-3 flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs text-white">
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {updates.map((u, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-xl border border-edge bg-surface-2 p-4"
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <h4 className="text-sm font-semibold text-ink">{u.title}</h4>
                      {u.date && <span className="shrink-0 text-xs text-ink-muted">{u.date}</span>}
                    </div>
                    {u.subjectName && (
                      <p className="mb-2 text-xs font-medium text-accent">{u.subjectName} {u.subjectCode && `(${u.subjectCode})`}</p>
                    )}
                    <p className="text-sm text-ink-muted line-clamp-3">{u.content}</p>
                    {u.author && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                        <User size={11} /> {u.author}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== Web View Tab ===== */}
        {tab === "webview" && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-edge bg-surface-2 px-3 py-2">
              <Globe size={14} className="text-ink-muted" />
              <input
                type="text"
                defaultValue="https://www.vut.cz/studis/student.phtml?sn=el_index"
                className="flex-1 rounded-lg border border-edge bg-surface px-3 py-1 text-xs text-ink outline-none focus:border-accent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const iframe = document.getElementById("vut-webview") as HTMLIFrameElement;
                    if (iframe) iframe.src = vutApi.proxyUrl((e.target as HTMLInputElement).value);
                  }
                }}
              />
              <a
                href="https://id.vut.cz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:text-ink"
              >
                <ExternalLink size={14} /> Open
              </a>
            </div>
            <iframe
              id="vut-webview"
              src={vutApi.proxyUrl("/studis/student.phtml?sn=el_index")}
              className="flex-1 border-0 bg-white"
              title="VUT Studis"
              sandbox="allow-same-origin allow-forms allow-scripts allow-popups allow-top-navigation"
            />
          </div>
        )}
      </div>
    </div>
  );

  async function importGradesToTracker(vutGrades: VutGrade[], semesters: string[]) {
    // Import VUT grades into the Grade Tracker app — creates a course (if not
    // already present) and an assignment representing the official VUT grade.
    let imported = 0;
    let updated = 0;
    for (const g of vutGrades) {
      if (!g.courseName) continue;
      try {
        const semester = g.semester || semesters[0] || "";
        const { courses } = await gradesApi.listCourses(semester || undefined);
        let existing = courses.find((c) => c.name === g.courseName);
        if (!existing) {
          const { course } = await gradesApi.createCourse({
            name: g.courseName,
            code: g.courseCode,
            semester,
            credits: parseInt(g.credits) || 3,
            color: "#6366f1",
          });
          existing = course;
          imported++;
        }
        // Create or update an assignment with the official VUT grade.
        // VUT score is typically "X / Y" or a plain number; parse it.
        const scoreNum = parseFloat(g.score) || 0;
        const gradeAssignmentName = `VUT Official Grade (${g.completionType || "Assessment"})`;
        const existingGrade = existing.assignments?.find(
          (a) => a.name === gradeAssignmentName
        );
        if (!existingGrade) {
          await gradesApi.createAssignment(existing.id, {
            name: gradeAssignmentName,
            score: scoreNum,
            maxScore: 100,
            weight: 1,
            category: "Exam",
          });
          updated++;
        }
      } catch { /* ignore errors, continue */ }
    }
    alert(
      `Imported ${imported} new course(s) and ${updated} grade(s) to Grade Tracker. Open the Grades app to see them.`
    );
  }
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-400";
  if (grade.startsWith("B")) return "text-blue-400";
  if (grade.startsWith("C")) return "text-amber-400";
  if (grade.startsWith("D")) return "text-orange-400";
  if (grade.startsWith("E") || grade.startsWith("F")) return "text-red-400";
  // Czech scale: 1=excellent, 4=pass, 5=fail
  if (grade === "1") return "text-green-400";
  if (grade === "2") return "text-blue-400";
  if (grade === "3") return "text-amber-400";
  if (grade === "4") return "text-orange-400";
  if (grade === "5") return "text-red-400";
  return "text-ink";
}

// ===== Timetable Grid Component =====

function TimetableGrid({ slots }: { slots: VutTimetableSlot[] }) {
  const isPhone = useFormFactor((s) => s.mode === "phone");
  // Group slots by day
  const byDay: Record<number, VutTimetableSlot[]> = {};
  for (const s of slots) {
    if (!byDay[s.dayIndex]) byDay[s.dayIndex] = [];
    byDay[s.dayIndex].push(s);
  }

  // Get all unique time slots
  const allTimes = Array.from(new Set(slots.map((s) => `${s.startTime}-${s.endTime}`))).sort();
  const weekDays = [0, 1, 2, 3, 4]; // Mon-Fri

  // Assign colors per course code
  const courseColors: Record<string, string> = {};
  let colorIdx = 0;
  for (const s of slots) {
    if (s.courseCode && !courseColors[s.courseCode]) {
      courseColors[s.courseCode] = SLOT_COLORS[colorIdx % SLOT_COLORS.length];
      colorIdx++;
    }
  }

  // ===== Mobile: day-by-day list =====
  if (isPhone) {
    return (
      <div className="space-y-4">
        {weekDays.map((d) => {
          const daySlots = (byDay[d] || []).sort((a, b) => a.startTime.localeCompare(b.startTime));
          if (daySlots.length === 0) return null;
          return (
            <div key={d}>
              <h4 className="mb-2 text-sm font-semibold text-ink">{DAYS_FULL[d]}</h4>
              <div className="space-y-2">
                {daySlots.map((slot, i) => {
                  const color = slot.courseCode && courseColors[slot.courseCode] ? courseColors[slot.courseCode] : "#6366f1";
                  return (
                    <div
                      key={i}
                      className="rounded-lg p-3"
                      style={{ backgroundColor: color + "20", borderLeft: `3px solid ${color}` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-ink">{slot.courseName}</p>
                        <span className="shrink-0 text-xs text-ink-muted">{slot.startTime}–{slot.endTime}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
                        {slot.type && <span>{slot.type}</span>}
                        {slot.room && <span className="flex items-center gap-0.5"><MapPin size={9} /> {slot.room}</span>}
                        {slot.teacher && <span>{slot.teacher}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ===== Desktop: weekly grid table =====
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-edge bg-surface-2 px-2 py-2 text-left font-medium text-ink-muted">Time</th>
            {weekDays.map((d) => (
              <th key={d} className="border border-edge bg-surface-2 px-2 py-2 text-center font-medium text-ink">
                {DAYS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allTimes.map((time) => {
            const [start, end] = time.split("-");
            return (
              <tr key={time}>
                <td className="sticky left-0 z-10 border border-edge bg-surface-2 px-2 py-3 text-ink-muted">
                  <div className="whitespace-nowrap">{start}</div>
                  <div className="text-[10px]">{end}</div>
                </td>
                {weekDays.map((d) => {
                  const slot = byDay[d]?.find((s) => `${s.startTime}-${s.endTime}` === time);
                  if (!slot) return <td key={d} className="border border-edge bg-surface/30" />;
                  const color = slot.courseCode && courseColors[slot.courseCode] ? courseColors[slot.courseCode] : "#6366f1";
                  return (
                    <td key={d} className="border border-edge p-1 align-top">
                      <div
                        className="rounded-lg p-2 text-white"
                        style={{ backgroundColor: color + "30", borderLeft: `3px solid ${color}` }}
                      >
                        <p className="truncate font-medium text-ink">{slot.courseName}</p>
                        {slot.type && <p className="text-[10px] text-ink-muted">{slot.type}</p>}
                        {slot.room && <p className="flex items-center gap-0.5 text-[10px] text-ink-muted"><MapPin size={9} /> {slot.room}</p>}
                        {slot.teacher && <p className="truncate text-[10px] text-ink-muted">{slot.teacher}</p>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

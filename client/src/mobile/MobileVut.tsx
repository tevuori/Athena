import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Lock, LogOut, RefreshCw } from "lucide-react";
import { vutApi } from "../services/vut";
import type { VutGrade, VutSubjectUpdate, VutTimetableSlot } from "../types";
import { MobileContainer, MobileEmpty, MobileHeader, MobileInput, MobileLoading } from "./MobileUi";

type Tab = "grades" | "timetable" | "updates";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function MobileVut({ onClose }: { onClose?: () => void }) {
  const [status, setStatus] = useState<{ configured: boolean; authenticated: boolean; username?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("grades");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await vutApi.status().catch(() => null);
    setStatus(res ?? { configured: false, authenticated: false });
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const login = async () => {
    setLoggingIn(true);
    await vutApi.login(username, password).catch(() => {});
    setPassword("");
    setLoggingIn(false);
    void loadStatus();
  };

  const logout = async () => {
    await vutApi.logout().catch(() => {});
    void loadStatus();
  };

  if (!status) return <MobileContainer><MobileLoading /></MobileContainer>;

  if (!status.authenticated) {
    return (
      <MobileContainer>
        <MobileHeader title="VUT" subtitle="Sign in to Studis" onClose={onClose} />
        <div className="rounded-2xl border border-white/10 bg-white/[.045] p-5">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
            <Lock size={24} />
          </div>
          <p className="mb-4 text-sm text-slate-400">Log in with your VUT credentials to load grades, timetable and updates.</p>
          <MobileInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="mb-3"
            autoComplete="username"
          />
          <MobileInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mb-4"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => void login()}
            disabled={loggingIn || !username.trim() || !password.trim()}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <MobileHeader
        title="VUT"
        subtitle={status.username || "Studis"}
        onClose={onClose}
        right={
          <div className="flex gap-2">
            <button type="button" onClick={() => void logout()} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[.06] text-white">
              <LogOut size={20} />
            </button>
          </div>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(["grades", "timetable", "updates"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "grades" && <VutGradesView />}
      {tab === "timetable" && <VutTimetableView />}
      {tab === "updates" && <VutUpdatesView />}
    </MobileContainer>
  );
}

function VutGradesView() {
  const [grades, setGrades] = useState<VutGrade[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await vutApi.grades().catch(() => null);
    setGrades(res?.grades ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="rounded-xl p-2 text-slate-400">
          <RefreshCw size={18} />
        </button>
      </div>
      {loading ? <MobileLoading /> : grades.length ? grades.map((g) => (
        <article key={`${g.courseCode}-${g.semester}`} className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{g.courseName}</p>
              <p className="text-xs text-slate-400">{g.courseCode} · {g.semester}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{g.grade}</p>
              <p className="text-xs text-slate-500">{g.ectsGrade}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{g.credits} credits · attempt {g.attempt}</p>
        </article>
      )) : <MobileEmpty text="No grades loaded yet." />}
    </div>
  );
}

function VutTimetableView() {
  const [slots, setSlots] = useState<VutTimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await vutApi.timetable().catch(() => null);
    setSlots(res?.slots ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = slots.reduce<Record<string, VutTimetableSlot[]>>((acc, s) => {
    if (!acc[s.day]) acc[s.day] = [];
    acc[s.day].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="rounded-xl p-2 text-slate-400">
          <RefreshCw size={18} />
        </button>
      </div>
      {loading ? <MobileLoading /> : slots.length ? DAYS.map((day) => (
        grouped[day] && (
          <div key={day}>
            <p className="mb-2 text-sm font-semibold text-indigo-300">{day}</p>
            <div className="space-y-2">
              {grouped[day].map((s, i) => (
                <article key={`${day}-${i}`} className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
                  <p className="font-medium text-white">{s.courseName}</p>
                  <p className="text-xs text-slate-400">{s.courseCode} · {s.type}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.startTime} – {s.endTime} · {s.room}</p>
                  {s.teacher && <p className="text-xs text-slate-500">{s.teacher}</p>}
                </article>
              ))}
            </div>
          </div>
        )
      )) : <MobileEmpty text="No timetable loaded yet." />}
    </div>
  );
}

function VutUpdatesView() {
  const [updates, setUpdates] = useState<VutSubjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await vutApi.updates().catch(() => null);
    setUpdates(res?.updates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="rounded-xl p-2 text-slate-400">
          <RefreshCw size={18} />
        </button>
      </div>
      {loading ? <MobileLoading /> : updates.length ? updates.map((u, i) => (
        <article key={`${u.subjectCode}-${i}`} className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
          <p className="font-medium text-white">{u.title}</p>
          <p className="text-xs text-slate-400">{u.subjectName} · {u.subjectCode}</p>
          <p className="mt-2 text-sm text-slate-300">{u.content}</p>
          <p className="mt-2 text-[11px] text-slate-500">{u.author} · {u.date}</p>
        </article>
      )) : <MobileEmpty text="No updates loaded yet." />}
    </div>
  );
}

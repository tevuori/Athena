import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, FilePlus2, ListPlus, Mic, Play, Sparkles, Timer } from "lucide-react";
import { useAuth } from "../store/auth";
import { tasksApi } from "../services/tasks";
import { calendarApi } from "../services/calendar";
import { flashcardsApi } from "../services/flashcards";
import type { CalendarEvent, Task } from "../types";
import type { MobileRoute } from "../shell/mobile/MobileShell";

export default function MobileHome({ onNavigate }: { onNavigate: (route: MobileRoute) => void }) {
  const user = useAuth((s) => s.user);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [due, setDue] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const [taskResult, eventResult, cardResult] = await Promise.all([
      tasksApi.list().catch(() => null),
      calendarApi.feed(start.toISOString(), end.toISOString()).catch(() => null),
      flashcardsApi.getDue().catch(() => null),
    ]);
    setTasks(taskResult?.tasks ?? []);
    setEvents(eventResult?.events ?? []);
    setDue(cardResult?.totalDue ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.displayName || user?.username || "Student").trim().split(/\s+/)[0];
  const openTasks = tasks.filter((task) => task.status !== "DONE").sort((a, b) => Number(a.priority === "HIGH") - Number(b.priority === "HIGH")).slice(0, 3);
  const nextEvent = useMemo(() => [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start))[0], [events]);

  return (
    <div className="mx-auto min-w-0 max-w-md px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-300">{greeting}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Hello Student, {firstName}</h1>
          <p className="mt-2 text-sm text-slate-400">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-sm font-bold text-white shadow-lg shadow-indigo-950/40">{firstName.slice(0, 1).toUpperCase()}</div>
      </header>

      <section className="mb-6 rounded-3xl border border-indigo-300/15 bg-gradient-to-br from-indigo-500/25 to-sky-500/10 p-5 shadow-xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-200">Your next step</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{nextEvent?.title || "Create a focused plan"}</h2>
            <p className="mt-1 text-sm text-slate-300">{nextEvent ? new Date(nextEvent.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Turn your priorities into progress."}</p>
          </div>
          <Timer className="text-indigo-200" size={27} />
        </div>
        <button type="button" onClick={() => onNavigate("calendar")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 active:scale-[.98]">
          View today <ChevronRight size={17} />
        </button>
      </section>

      <section className="mb-7">
        <p className="mb-3 text-sm font-semibold text-slate-300">Quick actions</p>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={<ListPlus size={21} />} label="Task" onClick={() => onNavigate("tasks")} />
          <QuickAction icon={<FilePlus2 size={21} />} label="Note" onClick={() => onNavigate("more")} />
          <QuickAction icon={<Play size={21} />} label="Focus" onClick={() => onNavigate("more")} />
          <QuickAction icon={<Mic size={21} />} label="Voice" onClick={() => onNavigate("more")} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead title="Today" action="See tasks" onClick={() => onNavigate("tasks")} />
        {loading ? <LoadingCard /> : openTasks.length ? openTasks.map((task) => <button key={task.id} type="button" onClick={() => onNavigate("tasks")} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-4 text-left active:bg-white/[.08]"><CheckCircle2 size={20} className={task.priority === "HIGH" ? "text-rose-400" : "text-slate-500"} /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{task.title}</span><ChevronRight size={17} className="text-slate-500" /></button>) : <Empty text="Your task list is clear. Add something worth doing." />}
        <SectionHead title="Study pulse" action="Open Athena" onClick={() => onNavigate("athena")} />
        <div className="grid grid-cols-2 gap-3"><Pulse label="Flashcards due" value={due} icon={<BookOpen size={18} />} /><Pulse label="Open tasks" value={tasks.filter((task) => task.status !== "DONE").length} icon={<Sparkles size={18} />} /></div>
      </section>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.055] text-slate-200 active:scale-[.97] active:bg-white/[.1]"><span className="text-indigo-300">{icon}</span><span className="text-xs font-medium">{label}</span></button>; }
function SectionHead({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <div className="flex items-center justify-between pt-2"><h2 className="text-lg font-bold text-white">{title}</h2><button type="button" onClick={onClick} className="text-sm font-medium text-indigo-300">{action}</button></div>; }
function Pulse({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4"><div className="mb-5 text-indigo-300">{icon}</div><p className="text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }
function LoadingCard() { return <div className="h-14 animate-pulse rounded-2xl bg-white/[.06]" />; }
function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-sm leading-6 text-slate-400">{text}</p>; }

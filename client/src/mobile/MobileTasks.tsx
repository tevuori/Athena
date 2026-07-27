import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Circle, Plus } from "lucide-react";
import { tasksApi, STATUS_LABELS } from "../services/tasks";
import { taskWorkspacesApi } from "../services/task-workspaces";
import type { Task, TaskPriority, TaskStatus, TaskWorkspace } from "../types";

const priorityStyle: Record<TaskPriority, string> = { HIGH: "bg-rose-400", MEDIUM: "bg-amber-400", LOW: "bg-sky-400" };
const ACTIVE_WS_KEY = "athena.activeTaskWorkspace";

export default function MobileTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<(TaskWorkspace & { taskCount: number })[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(() => localStorage.getItem(ACTIVE_WS_KEY));
  const [wsPickerOpen, setWsPickerOpen] = useState(false);
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [taskResult, wsResult] = await Promise.all([
      tasksApi.list(activeWsId ?? undefined).catch(() => null),
      taskWorkspacesApi.list().catch(() => null),
    ]);
    setTasks(taskResult?.tasks ?? []);
    const ws = wsResult?.workspaces ?? [];
    setWorkspaces(ws);
    if (activeWsId && !ws.some((w) => w.id === activeWsId)) {
      setActiveWsId(null);
      localStorage.removeItem(ACTIVE_WS_KEY);
    }
    setLoading(false);
  }, [activeWsId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => tasks.filter((task) => status === "all" || task.status === status).sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || +new Date(a.dueDate || "2999-01-01") - +new Date(b.dueDate || "2999-01-01")), [tasks, status]);

  const create = async () => {
    if (!draft.trim()) return;
    const result = await tasksApi.create({ title: draft.trim(), status: "TODO", priority: "MEDIUM", workspaceId: activeWsId ?? undefined }).catch(() => null);
    if (result) setTasks((list) => [result.task, ...list]);
    setDraft("");
    setAdding(false);
    void load();
  };
  const toggle = async (task: Task) => {
    const next: TaskStatus = task.status === "DONE" ? "TODO" : "DONE";
    setTasks((list) => list.map((item) => item.id === task.id ? { ...item, status: next } : item));
    await tasksApi.update(task.id, { status: next }).catch(() => { void load(); });
  };
  const selectWs = (id: string | null) => {
    setActiveWsId(id);
    if (id) localStorage.setItem(ACTIVE_WS_KEY, id); else localStorage.removeItem(ACTIVE_WS_KEY);
    setWsPickerOpen(false);
  };
  const activeWs = workspaces.find((w) => w.id === activeWsId) ?? null;

  return (
    <div className="mx-auto max-w-md px-5 pb-7 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-300">Get it done</p>
          <h1 className="mt-1 text-3xl font-bold text-white">Tasks</h1>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/40">
          <Plus size={22} />
        </button>
      </header>

      <button type="button" onClick={() => setWsPickerOpen((v) => !v)} className="mb-4 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.045] px-4 py-3 text-left active:bg-white/[.08]">
        <span className="flex items-center gap-2">
          {activeWs ? <span className="h-3 w-3 rounded-full" style={{ background: activeWs.color }} /> : <Circle size={14} className="text-slate-500" />}
          <span className="text-sm font-medium text-white">{activeWs ? activeWs.name : "All workspaces"}</span>
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition ${wsPickerOpen ? "rotate-180" : ""}`} />
      </button>
      {wsPickerOpen && (
        <div className="mb-4 space-y-1 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5">
          <button type="button" onClick={() => selectWs(null)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${!activeWsId ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 active:bg-white/[.06]"}`}>
            <Circle size={14} className="text-slate-500" /> All workspaces
          </button>
          {workspaces.map((ws) => (
            <button key={ws.id} type="button" onClick={() => selectWs(ws.id)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${activeWsId === ws.id ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 active:bg-white/[.06]"}`}>
              <span className="h-3 w-3 rounded-full" style={{ background: ws.color }} /> {ws.name}
              <span className="ml-auto text-xs text-slate-500">{ws.taskCount}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {(["all", "TODO", "IN_PROGRESS", "DONE"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${status === value ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"}`}>
            {value === "all" ? "All" : STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {adding && (
        <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="mb-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-3">
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What needs doing?" className="w-full bg-transparent px-2 py-2 text-base text-white outline-none placeholder:text-slate-500" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl px-3 py-2 text-sm text-slate-400">Cancel</button>
            <button className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">Add task</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {loading ? <div className="h-16 animate-pulse rounded-2xl bg-white/[.06]" /> : visible.length ? visible.map((task) => (
          <article key={task.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-4">
            <button type="button" onClick={() => void toggle(task)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${task.status === "DONE" ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-500 text-transparent"}`}>
              <Check size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${task.status === "DONE" ? "text-slate-500 line-through" : "text-white"}`}>{task.title}</p>
              <p className="mt-1 text-xs text-slate-400">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No deadline"}</p>
            </div>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${priorityStyle[task.priority]}`} />
          </article>
        )) : <div className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">No tasks here. Your future self approves.</div>}
      </div>
    </div>
  );
}

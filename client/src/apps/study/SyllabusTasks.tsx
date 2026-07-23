// ===== Study Hub: Syllabus → Tasks =====

import { useState } from "react";
import { Sparkles, Plus, Trash2, CheckSquare } from "lucide-react";
import SourcePicker from "./SourcePicker";
import { ActionButton, ErrorBanner, Loading, SuccessBanner, TruncationNote } from "./ui";
import { studyApi, type SourceDescriptor, type SyllabusTask } from "../../services/study";
import { tasksApi } from "../../services/tasks";
import { useWindows } from "../../store/windows";

export default function SyllabusTasks({ initialSource }: { initialSource?: SourceDescriptor | null }) {
  const [source, setSource] = useState<SourceDescriptor | null>(initialSource ?? null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tasks, setTasks] = useState<SyllabusTask[]>([]);
  const [truncated, setTruncated] = useState(false);
  const openWindow = useWindows((s) => s.open);

  const run = async () => {
    if (!source) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setTasks([]);
    try {
      const res = await studyApi.syllabusTasks({ source, create: false });
      setTasks(res.tasks);
      setTruncated(res.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract tasks");
    } finally {
      setLoading(false);
    }
  };

  const updateTask = (i: number, field: keyof SyllabusTask, val: string) => {
    setTasks((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, [field]: val } : t))
    );
  };

  const removeTask = (i: number) => {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addTask = () => {
    setTasks((prev) => [...prev, { title: "", dueDate: null, priority: "MEDIUM" }]);
  };

  const saveAll = async () => {
    const valid = tasks.filter((t) => t.title.trim());
    if (valid.length === 0) return;
    setSaving(true);
    setError("");
    try {
      for (const t of valid) {
        await tasksApi.create({
          title: t.title,
          priority: t.priority,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        });
      }
      setSuccess(`Created ${valid.length} tasks.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tasks");
    } finally {
      setSaving(false);
    }
  };

  const openTasks = () => {
    openWindow({ appId: "tasks", title: "Tasks", icon: "CheckSquare" });
  };

  return (
    <div className="flex flex-col gap-3">
      <SourcePicker value={source} onChange={setSource} />
      <p className="text-xs text-ink-muted">
        Paste a syllabus, assignment list, or course outline — Athena extracts tasks with due dates and priorities.
      </p>
      <ActionButton onClick={run} disabled={!source} loading={loading}>
        <Sparkles size={13} /> Extract tasks
      </ActionButton>

      {loading && <Loading label="Extracting tasks…" />}
      {error && <ErrorBanner message={error} />}
      <TruncationNote show={truncated} />
      {success && (
        <div className="flex items-center gap-2">
          <SuccessBanner message={success} />
          <ActionButton onClick={openTasks} variant="ghost">
            <CheckSquare size={12} /> Open Tasks
          </ActionButton>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-muted">
              {tasks.length} tasks — edit, then create
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={addTask}
                className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <Plus size={12} /> Add
              </button>
              <ActionButton onClick={saveAll} loading={saving}>
                Create {tasks.filter((t) => t.title.trim()).length} tasks
              </ActionButton>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {tasks.map((t, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-edge bg-surface-2 p-2">
                <input
                  value={t.title}
                  onChange={(e) => updateTask(i, "title", e.target.value)}
                  placeholder="Task title"
                  className="flex-1 rounded border border-edge bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                />
                <input
                  type="date"
                  value={t.dueDate ? t.dueDate.slice(0, 10) : ""}
                  onChange={(e) => updateTask(i, "dueDate", e.target.value || "")}
                  className="rounded border border-edge bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                />
                <select
                  value={t.priority}
                  onChange={(e) => updateTask(i, "priority", e.target.value)}
                  className="rounded border border-edge bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Med</option>
                  <option value="HIGH">High</option>
                </select>
                <button
                  onClick={() => removeTask(i)}
                  className="rounded p-1 text-ink-muted hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

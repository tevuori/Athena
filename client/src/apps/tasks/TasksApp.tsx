import { useState, useEffect, useCallback } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Flag, Calendar, Loader2, GripVertical } from "lucide-react";
import { tasksApi, STATUS_LABELS, STATUS_ORDER, PRIORITY_LABELS, PRIORITY_COLORS } from "../../services/tasks";
import type { Task, TaskStatus, TaskPriority } from "../../types";
import type { WindowInstance } from "../../store/windows";

export default function TasksApp(_: { win: WindowInstance }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tasks } = await tasksApi.list();
      setTasks(tasks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;
    // over.id can be a column id ("TODO") or a task id
    const overId = String(over.id);
    let newStatus: TaskStatus | null = null;
    if (STATUS_ORDER.includes(overId as TaskStatus)) {
      newStatus = overId as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) newStatus = overTask.status;
    }
    if (newStatus && newStatus !== activeTask.status) {
      const updated = { ...activeTask, status: newStatus };
      setTasks((prev) => prev.map((t) => (t.id === activeTask.id ? updated : t)));
      try {
        await tasksApi.update(activeTask.id, { status: newStatus });
      } catch {
        setTasks((prev) => prev.map((t) => (t.id === activeTask.id ? activeTask : t)));
      }
    }
  };

  const createTask = async (status: TaskStatus) => {
    if (!newTitle.trim()) return;
    try {
      const { task } = await tasksApi.create({ title: newTitle, status });
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      setAddingTo(null);
    } catch (e) {
      console.error(e);
    }
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    try {
      await tasksApi.update(id, data);
    } catch (e) {
      console.error(e);
      load();
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await tasksApi.delete(id);
    } catch {
      load();
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-edge px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Tasks</h2>
        <p className="text-xs text-ink-muted">{tasks.length} total · drag cards between columns</p>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto p-3">
          {STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={byStatus(status)}
              addingTo={addingTo}
              setAddingTo={setAddingTo}
              newTitle={newTitle}
              setNewTitle={setNewTitle}
              onCreate={() => createTask(status)}
              onUpdate={updateTask}
              onDelete={deleteTask}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status, tasks, addingTo, setAddingTo, newTitle, setNewTitle, onCreate, onUpdate, onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  addingTo: TaskStatus | null;
  setAddingTo: (s: TaskStatus | null) => void;
  newTitle: string;
  setNewTitle: (s: string) => void;
  onCreate: () => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-edge bg-surface-2">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{STATUS_LABELS[status]}</span>
          <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-muted">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => setAddingTo(addingTo === status ? null : status)}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-surface-3 hover:text-ink"
        >
          <Plus size={14} />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto p-2 transition ${isOver ? "bg-accent/5" : ""}`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </SortableContext>

        {addingTo === status && (
          <div className="rounded-lg border border-accent bg-surface p-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreate();
                if (e.key === "Escape") {
                  setAddingTo(null);
                  setNewTitle("");
                }
              }}
              placeholder="Task title..."
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={onCreate}
                className="rounded bg-accent px-2.5 py-1 text-xs text-accent-fg"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingTo(null);
                  setNewTitle("");
                }}
                className="rounded px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-3"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {tasks.length === 0 && addingTo !== status && (
          <p className="py-6 text-center text-xs text-ink-muted">No tasks</p>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  task, onUpdate, onDelete,
}: {
  task: Task;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onUpdate={onUpdate} onDelete={onDelete} />
    </div>
  );
}

function TaskCard({
  task, onUpdate, onDelete, dragging,
}: {
  task: Task;
  onUpdate?: (id: string, data: Partial<Task>) => void;
  onDelete?: (id: string) => void;
  dragging?: boolean;
}) {
  return (
    <div
      className={`group rounded-lg border border-edge bg-surface p-2.5 shadow-sm transition hover:border-ink-muted/30 ${
        dragging ? "shadow-window rotate-1" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm text-ink">{task.title}</p>
        {onUpdate && (
          <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
            <select
              value={task.priority}
              onChange={(e) => onUpdate(task.id, { priority: e.target.value as TaskPriority })}
              className="bg-transparent text-[10px] text-ink-muted outline-none"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete?.(task.id)}
              className="text-ink-muted hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-[11px] text-ink-muted">{task.description}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className={`flex items-center gap-1 text-[10px] text-ink-muted`}>
          <span className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
          {PRIORITY_LABELS[task.priority]}
        </span>
        {task.dueDate && (
          <span className="flex items-center gap-1 text-[10px] text-ink-muted">
            <Calendar size={10} />
            {new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
        )}
        {task.recurring && (
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] text-ink-muted">
            ↻ {task.recurring}
          </span>
        )}
      </div>
    </div>
  );
}

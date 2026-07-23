// ===== Calendar / Planner =====
// Month / Week / Day views that unify manual CalendarEvent rows, scheduled
// tasks, VUT timetable classes, and assignment due dates into one timeline.
// Reuses existing client services — no new backend beyond /api/calendar.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, RefreshCw,
  Upload, Download, Trash2, X, Clock, MapPin, Layers, Cloud, CloudOff,
} from "lucide-react";
import { calendarApi } from "../../services/calendar";
import { tasksApi } from "../../services/tasks";
import { vutApi } from "../../services/vut";
import { gradesApi } from "../../services/grades";
import { microsoftApi } from "../../services/microsoft";
import { useWindows } from "../../store/windows";
import type { WindowInstance } from "../../store/windows";
import type { CalendarEvent, Task, VutTimetableSlot, Course } from "../../types";

type ViewMode = "month" | "week" | "day";

interface LayerToggles {
  events: boolean;
  tasks: boolean;
  vut: boolean;
  assignments: boolean;
  microsoft: boolean;
}

const LAYER_COLORS: Record<keyof LayerToggles, string> = {
  events: "#6366f1",
  tasks: "#f59e0b",
  vut: "#0ea5e9",
  assignments: "#ef4444",
  microsoft: "#0ea5e9",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-start
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** A unified render-time event regardless of source. */
interface DisplayEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  source: string;
  sourceRef: string;
  location: string;
  description: string;
}

export default function CalendarApp({ win }: { win: WindowInstance }) {
  const openWindow = useWindows((s) => s.open);
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(() => {
    const p = win?.payload as { date?: string } | undefined;
    return p?.date ? new Date(p.date) : new Date();
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [vutSlots, setVutSlots] = useState<VutTimetableSlot[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [vutConnected, setVutConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<LayerToggles>({ events: true, tasks: true, vut: true, assignments: true, microsoft: true });
  const [msConfigured, setMsConfigured] = useState(false);
  const [msSyncing, setMsSyncing] = useState(false);
  const [msSyncMsg, setMsSyncMsg] = useState<string | null>(null);

  // Event editor state
  const [editing, setEditing] = useState<Partial<CalendarEvent> | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== Data loading =====
  const refresh = useCallback(async () => {
    setLoading(true);
    // Compute the visible range + a 1-month buffer for month view overflow.
    const rangeStart = new Date(cursor);
    rangeStart.setDate(-7);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(cursor);
    rangeEnd.setDate(38);
    rangeEnd.setHours(23, 59, 59, 999);

    const [feedRes, tasksRes, vutStatusRes, msStatusRes] = await Promise.all([
      calendarApi.feed(rangeStart.toISOString(), rangeEnd.toISOString()).catch(() => null),
      tasksApi.list().catch(() => null),
      vutApi.status().catch(() => null),
      microsoftApi.status().catch(() => null),
    ]);
    if (feedRes?.events) setEvents(feedRes.events);
    if (tasksRes?.tasks) setTasks(tasksRes.tasks);
    setMsConfigured(Boolean((msStatusRes as { configured?: boolean } | null)?.configured));
    const st = vutStatusRes as { authenticated: boolean } | null;
    setVutConnected(Boolean(st?.authenticated));
    if (st?.authenticated) {
      const tt = await vutApi.timetable().catch(() => null);
      if (tt?.slots) setVutSlots(tt.slots);
    } else {
      setVutSlots([]);
    }
    // Load courses for assignment due dates (assignments don't have due
    // dates in the current schema, so we show course deadlines as a
    // read-only layer using the task's dueDate when linked). We still load
    // courses so the assignments layer can be toggled — but since the
    // Assignment model has no dueDate, this layer maps tasks with
    // category-like titles. For now we keep it as a no-op layer toggle
    // ready for future assignment due dates.
    const cRes = await gradesApi.listCourses().catch(() => null);
    if (cRes?.courses) setCourses(cRes.courses);
    setLoading(false);
  }, [cursor]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ===== Build display events from all sources =====
  const displayEvents: DisplayEvent[] = useMemo(() => {
    const out: DisplayEvent[] = [];
    // Split events: microsoft-sourced events are controlled by the microsoft
    // layer toggle; all others (manual, task, ics) by the events toggle.
    if (layers.events) {
      for (const e of events) {
        if (e.source === "microsoft") continue; // handled below
        out.push({
          id: e.id,
          title: e.title,
          start: new Date(e.start),
          end: new Date(e.end),
          allDay: e.allDay,
          color: e.color || LAYER_COLORS.events,
          source: e.source,
          sourceRef: e.sourceRef,
          location: e.location,
          description: e.description,
        });
      }
    }
    if (layers.microsoft) {
      for (const e of events) {
        if (e.source !== "microsoft") continue;
        out.push({
          id: e.id,
          title: `☁ ${e.title}`,
          start: new Date(e.start),
          end: new Date(e.end),
          allDay: e.allDay,
          color: e.color || LAYER_COLORS.microsoft,
          source: e.source,
          sourceRef: e.sourceRef,
          location: e.location,
          description: e.description,
        });
      }
    }
    if (layers.tasks) {
      for (const t of tasks) {
        if (!t.dueDate || t.status === "DONE") continue;
        const due = new Date(t.dueDate);
        out.push({
          id: `task-${t.id}`,
          title: `📋 ${t.title}`,
          start: due,
          end: new Date(due.getTime() + 60 * 60 * 1000),
          allDay: false,
          color: LAYER_COLORS.tasks,
          source: "task",
          sourceRef: t.id,
          location: "",
          description: t.description,
        });
      }
    }
    if (layers.vut && vutSlots.length) {
      // VUT timetable slots are weekly; project onto the current week.
      const weekStart = startOfWeek(cursor);
      for (const slot of vutSlots) {
        const [sh, sm] = slot.startTime.split(":").map(Number);
        const [eh, em] = slot.endTime.split(":").map(Number);
        const dayDate = addDays(weekStart, slot.dayIndex);
        const start = new Date(dayDate);
        start.setHours(sh, sm, 0, 0);
        const end = new Date(dayDate);
        end.setHours(eh, em, 0, 0);
        out.push({
          id: `vut-${slot.dayIndex}-${slot.startTime}`,
          title: `🎓 ${slot.courseName}`,
          start,
          end,
          allDay: false,
          color: slot.color || LAYER_COLORS.vut,
          source: "vut",
          sourceRef: "",
          location: slot.room,
          description: `${slot.type} · ${slot.teacher}`,
        });
      }
    }
    return out;
  }, [events, tasks, vutSlots, layers, cursor]);

  // ===== Event handlers =====
  const openEditor = (ev?: Partial<CalendarEvent>, date?: Date) => {
    if (ev) {
      setEditing(ev);
    } else {
      const start = date ?? new Date();
      start.setHours(start.getHours() + 1, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setEditing({ title: "", start: start.toISOString(), end: end.toISOString(), allDay: false, color: LAYER_COLORS.events, location: "", description: "" });
    }
    setShowEditor(true);
  };

  /** Convert a DisplayEvent (Date objects) into a Partial<CalendarEvent> (ISO strings) for the editor. */
  const displayToPartial = (ev: DisplayEvent): Partial<CalendarEvent> => ({
    id: ev.source === "manual" || ev.source === "task" || ev.source === "ics" ? ev.id : undefined,
    title: ev.title,
    start: ev.start.toISOString(),
    end: ev.end.toISOString(),
    allDay: ev.allDay,
    color: ev.color,
    location: ev.location,
    description: ev.description,
    source: ev.source,
    sourceRef: ev.sourceRef,
  });

  const saveEvent = async () => {
    if (!editing || !editing.title || !editing.start || !editing.end) return;
    try {
      if (editing.id) {
        await calendarApi.update(editing.id, editing);
      } else {
        await calendarApi.create(editing);
      }
      setShowEditor(false);
      setEditing(null);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await calendarApi.delete(id);
      setShowEditor(false);
      setEditing(null);
      refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleIcsImport = async (file: File) => {
    const text = await file.text();
    try {
      const { imported } = await calendarApi.importIcs(text);
      alert(`Imported ${imported} event(s).`);
      refresh();
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  };

  const exportIcs = () => {
    const token = localStorage.getItem("athena.token");
    fetch("/api/calendar/ics/export", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "athena-calendar.ics";
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  // Sync with Microsoft Calendar (pull remote events into local DB).
  const syncMicrosoft = async () => {
    if (!msConfigured || msSyncing) return;
    setMsSyncing(true);
    setMsSyncMsg(null);
    try {
      const rangeStart = new Date(cursor);
      rangeStart.setDate(-7);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(cursor);
      rangeEnd.setDate(38);
      rangeEnd.setHours(23, 59, 59, 999);
      const res = await microsoftApi.sync(rangeStart.toISOString(), rangeEnd.toISOString());
      setMsSyncMsg(`Synced ${res.synced} event(s)${res.deleted ? `, removed ${res.deleted}` : ""}`);
      refresh();
    } catch (e) {
      setMsSyncMsg(`Sync failed: ${(e as Error).message}`);
    } finally {
      setMsSyncing(false);
      setTimeout(() => setMsSyncMsg(null), 5000);
    }
  };

  // Push a local event to Microsoft Calendar.
  const pushToMicrosoft = async (eventId: string) => {
    try {
      await microsoftApi.push(eventId);
      setMsSyncMsg("Event pushed to Microsoft Calendar");
      refresh();
    } catch (e) {
      setMsSyncMsg(`Push failed: ${(e as Error).message}`);
    }
    setTimeout(() => setMsSyncMsg(null), 5000);
  };

  // Drag a task onto a calendar slot to schedule a study session.
  const onDrop = async (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/task-id");
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const start = new Date(date);
    start.setHours(start.getHours() + 1, 0, 0, 0);
    if (start.getTime() < Date.now()) start.setTime(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    try {
      await calendarApi.create({
        title: `Study: ${task.title}`,
        description: task.description,
        start: start.toISOString(),
        end: end.toISOString(),
        source: "task",
        sourceRef: task.id,
        color: LAYER_COLORS.tasks,
      });
      refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // ===== Navigation =====
  const goPrev = () => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    else if (view === "week") setCursor(addDays(startOfWeek(cursor), -7));
    else setCursor(addDays(cursor, -1));
  };
  const goNext = () => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    else if (view === "week") setCursor(addDays(startOfWeek(cursor), 7));
    else setCursor(addDays(cursor, 1));
  };
  const goToday = () => setCursor(new Date());

  const headerLabel = useMemo(() => {
    if (view === "month") return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (view === "week") {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      return `${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${we.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [view, cursor]);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
        <div className="flex items-center gap-1.5 text-accent">
          <CalendarIcon size={18} />
          <span className="text-sm font-semibold">Calendar</span>
        </div>
        <div className="mx-1 flex items-center gap-1">
          <button onClick={goPrev} className="rounded-md p-1.5 text-ink-muted hover:bg-surface-3" title="Previous">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goToday} className="rounded-md border border-edge px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-3">
            Today
          </button>
          <button onClick={goNext} className="rounded-md p-1.5 text-ink-muted hover:bg-surface-3" title="Next">
            <ChevronRight size={16} />
          </button>
        </div>
        <h2 className="flex-1 text-sm font-semibold text-ink">{headerLabel}</h2>

        {/* Layer toggles */}
        <div className="flex items-center gap-1.5">
          <Layers size={14} className="text-ink-muted" />
          {(Object.keys(LAYER_COLORS) as (keyof LayerToggles)[]).map((k) => (
            <button
              key={k}
              onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                layers[k] ? "border-transparent text-white" : "border-edge text-ink-muted"
              }`}
              style={layers[k] ? { background: LAYER_COLORS[k] } : {}}
              title={
                k === "vut" && !vutConnected ? "VUT not connected" :
                k === "microsoft" && !msConfigured ? "Microsoft Calendar not configured" :
                `Toggle ${k}`
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: layers[k] ? "#fff" : LAYER_COLORS[k] }} />
              {k === "vut" ? "VUT" : k === "microsoft" ? "MS" : k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        <div className="mx-1 flex rounded-md border border-edge">
          {(["month", "week", "day"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 text-xs font-medium capitalize transition ${
                view === v ? "bg-accent text-white" : "text-ink-muted hover:bg-surface-3"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <button onClick={() => fileInputRef.current?.click()} className="rounded-md border border-edge px-2 py-1 text-xs text-ink-muted hover:bg-surface-3" title="Import .ics">
          <Upload size={13} className="inline" /> ICS
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIcsImport(f); e.target.value = ""; }}
        />
        <button onClick={exportIcs} className="rounded-md border border-edge px-2 py-1 text-xs text-ink-muted hover:bg-surface-3" title="Export .ics">
          <Download size={13} className="inline" />
        </button>
        {msConfigured ? (
          <button
            onClick={syncMicrosoft}
            disabled={msSyncing}
            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-ink-muted hover:bg-surface-3 disabled:opacity-50"
            title="Sync with Microsoft Calendar"
          >
            {msSyncing ? <RefreshCw size={13} className="animate-spin" /> : <Cloud size={13} />}
            Sync
          </button>
        ) : (
          <span className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-ink-muted/40" title="Microsoft Calendar not configured">
            <CloudOff size={13} /> Sync
          </span>
        )}
        <button onClick={refresh} className="rounded-md p-1.5 text-ink-muted hover:bg-surface-3" title="Refresh">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button onClick={() => openEditor()} className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">
          <Plus size={13} /> New
        </button>
      </div>

      {/* Sync status message */}
      {msSyncMsg && (
        <div className="border-b border-edge bg-surface-2/60 px-3 py-1 text-[11px] text-ink-muted">
          {msSyncMsg}
        </div>
      )}

      {/* Unscheduled tasks strip (drag source) */}
      {layers.tasks && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-edge bg-surface-2/40 px-3 py-1.5">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Unscheduled:</span>
          {tasks.filter((t) => t.status !== "DONE" && t.dueDate).length === 0 && (
            <span className="text-[11px] text-ink-muted/60">No tasks with due dates — drag from Tasks app</span>
          )}
          {tasks
            .filter((t) => t.status !== "DONE")
            .slice(0, 12)
            .map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                className="shrink-0 cursor-grab rounded-full border border-edge bg-surface px-2.5 py-0.5 text-[11px] text-ink hover:border-accent active:cursor-grabbing"
                title={t.title}
              >
                📋 {t.title}
              </div>
            ))}
        </div>
      )}

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {view === "month" && <MonthView cursor={cursor} events={displayEvents} onDrop={onDrop} onEventClick={(ev) => openEditor(events.find((e) => e.id === ev.id) ?? displayToPartial(ev))} onSlotClick={(d) => openEditor(undefined, d)} />}
        {view === "week" && <WeekView cursor={cursor} events={displayEvents} onDrop={onDrop} onEventClick={(ev) => openEditor(events.find((e) => e.id === ev.id) ?? displayToPartial(ev))} onSlotClick={(d) => openEditor(undefined, d)} />}
        {view === "day" && <DayView cursor={cursor} events={displayEvents} onDrop={onDrop} onEventClick={(ev) => openEditor(events.find((e) => e.id === ev.id) ?? displayToPartial(ev))} onSlotClick={(d) => openEditor(undefined, d)} />}
      </div>

      {/* Event editor modal */}
      {showEditor && editing && (
        <EventEditor
          event={editing}
          onChange={setEditing}
          onSave={saveEvent}
          onDelete={editing.id ? () => deleteEvent(editing.id!) : undefined}
          onPushToMs={editing.id && editing.source !== "microsoft" && msConfigured ? () => pushToMicrosoft(editing.id!) : undefined}
          isMicrosoftEvent={editing.source === "microsoft"}
          onClose={() => { setShowEditor(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ===== Month view =====
function MonthView({
  cursor, events, onDrop, onEventClick, onSlotClick,
}: {
  cursor: Date;
  events: DisplayEvent[];
  onDrop: (e: React.DragEvent, date: Date) => void;
  onEventClick: (ev: DisplayEvent) => void;
  onSlotClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const today = new Date();
  const weeks: Date[][] = [];
  let cur = gridStart;
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(cur);
      cur = addDays(cur, 1);
    }
    weeks.push(row);
  }

  return (
    <div className="flex h-full flex-col overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7 border-b border-edge bg-surface-2/40">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{d}</div>
        ))}
      </div>
      <div className="grid min-w-[640px] flex-1 grid-cols-7 grid-rows-6">
        {weeks.flat().map((date, i) => {
          const inMonth = date.getMonth() === cursor.getMonth();
          const isToday = sameDay(date, today);
          const dayEvents = events.filter((e) => sameDay(e.start, date));
          return (
            <div
              key={i}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, date)}
              onClick={() => onSlotClick(date)}
              className={`group relative min-h-[80px] cursor-pointer border-b border-r border-edge p-1 transition hover:bg-surface-2/60 ${inMonth ? "bg-surface" : "bg-surface-2/30"}`}
            >
              <div className={`mb-0.5 flex items-center justify-end text-[11px] ${isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent font-bold text-white" : "text-ink-muted"}`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                    style={{ background: ev.color }}
                    title={ev.title}
                  >
                    {ev.allDay ? "" : `${ev.start.getHours().toString().padStart(2, "0")}:${ev.start.getMinutes().toString().padStart(2, "0")} `}
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 4 && (
                  <div className="text-[10px] text-ink-muted">+{dayEvents.length - 4} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Week view =====
function WeekView({
  cursor, events, onDrop, onEventClick, onSlotClick,
}: {
  cursor: Date;
  events: DisplayEvent[];
  onDrop: (e: React.DragEvent, date: Date) => void;
  onEventClick: (ev: DisplayEvent) => void;
  onSlotClick: (d: Date) => void;
}) {
  const ws = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = new Date();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_PX = 44;

  return (
    <div className="flex h-full flex-col">
      <div className="grid min-w-[700px] grid-cols-[60px_repeat(7,1fr)] border-b border-edge bg-surface-2/40">
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="px-1 py-1.5 text-center">
            <div className="text-[10px] font-semibold uppercase text-ink-muted">{WEEKDAYS[days.indexOf(d)]}</div>
            <div className={`text-sm font-semibold ${sameDay(d, today) ? "text-accent" : "text-ink"}`}>{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <div className="relative grid min-w-[700px] grid-cols-[60px_repeat(7,1fr)]">
          {/* Hour labels */}
          <div>
            {hours.map((h) => (
              <div key={h} className="relative border-b border-edge/40 text-right pr-1 text-[10px] text-ink-muted" style={{ height: HOUR_PX }}>
                <span className="absolute -top-1.5 right-1">{h === 0 ? "" : `${h}:00`}</span>
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map((date) => {
            const dayEvents = events.filter((e) => sameDay(e.start, date) && !e.allDay);
            return (
              <div
                key={date.toISOString()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, date)}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const y = e.clientY - rect.top + (e.currentTarget.parentElement?.scrollTop ?? 0);
                  const hour = Math.floor(y / HOUR_PX);
                  const d = new Date(date); d.setHours(hour, 0, 0, 0);
                  onSlotClick(d);
                }}
                className="relative border-l border-edge"
              >
                {hours.map((h) => (
                  <div key={h} className="border-b border-edge/40" style={{ height: HOUR_PX }} />
                ))}
                {dayEvents.map((ev) => {
                  const top = (ev.start.getHours() * 60 + ev.start.getMinutes()) * (HOUR_PX / 60);
                  const heightMins = Math.max(15, (ev.end.getTime() - ev.start.getTime()) / 60000);
                  const height = heightMins * (HOUR_PX / 60);
                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-[10px] text-white"
                      style={{ top, height, background: ev.color }}
                      title={ev.title}
                    >
                      <div className="font-semibold truncate">{ev.title}</div>
                      <div className="truncate opacity-80">{ev.start.getHours().toString().padStart(2, "0")}:{ev.start.getMinutes().toString().padStart(2, "0")}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Day view =====
function DayView({
  cursor, events, onDrop, onEventClick, onSlotClick,
}: {
  cursor: Date;
  events: DisplayEvent[];
  onDrop: (e: React.DragEvent, date: Date) => void;
  onEventClick: (ev: DisplayEvent) => void;
  onSlotClick: (d: Date) => void;
}) {
  const today = new Date();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const HOUR_PX = 56;
  const dayEvents = events.filter((e) => sameDay(e.start, cursor) && !e.allDay);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-edge bg-surface-2/40 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase text-ink-muted">{WEEKDAYS_LONG[(cursor.getDay() + 6) % 7]}</div>
        <div className={`text-base font-semibold ${sameDay(cursor, today) ? "text-accent" : "text-ink"}`}>
          {cursor.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="relative grid grid-cols-[70px_1fr]">
          <div>
            {hours.map((h) => (
              <div key={h} className="relative border-b border-edge/40 pr-2 text-right text-[11px] text-ink-muted" style={{ height: HOUR_PX }}>
                <span className="absolute -top-1.5 right-2">{h === 0 ? "" : `${h}:00`}</span>
              </div>
            ))}
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, cursor)}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const y = e.clientY - rect.top + (e.currentTarget.parentElement?.scrollTop ?? 0);
              const hour = Math.floor(y / HOUR_PX);
              const d = new Date(cursor); d.setHours(hour, 0, 0, 0);
              onSlotClick(d);
            }}
            className="relative border-l border-edge"
          >
            {hours.map((h) => (
              <div key={h} className="border-b border-edge/40" style={{ height: HOUR_PX }} />
            ))}
            {dayEvents.map((ev) => {
              const top = (ev.start.getHours() * 60 + ev.start.getMinutes()) * (HOUR_PX / 60);
              const heightMins = Math.max(15, (ev.end.getTime() - ev.start.getTime()) / 60000);
              const height = heightMins * (HOUR_PX / 60);
              return (
                <div
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  className="absolute left-1 right-1 overflow-hidden rounded px-2 py-1 text-xs text-white"
                  style={{ top, height, background: ev.color }}
                >
                  <div className="font-semibold truncate">{ev.title}</div>
                  <div className="opacity-80">
                    {ev.start.getHours().toString().padStart(2, "0")}:{ev.start.getMinutes().toString().padStart(2, "0")} – {ev.end.getHours().toString().padStart(2, "0")}:{ev.end.getMinutes().toString().padStart(2, "0")}
                    {ev.location && <span className="ml-1.5 inline-flex items-center gap-0.5"><MapPin size={9} />{ev.location}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Event editor modal =====
function EventEditor({
  event, onChange, onSave, onDelete, onPushToMs, isMicrosoftEvent, onClose,
}: {
  event: Partial<CalendarEvent>;
  onChange: (e: Partial<CalendarEvent>) => void;
  onSave: () => void;
  onDelete?: () => void;
  onPushToMs?: () => void;
  isMicrosoftEvent?: boolean;
  onClose: () => void;
}) {
  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  };
  const fromLocalInput = (v: string) => new Date(v).toISOString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-edge bg-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{event.id ? "Edit Event" : "New Event"}</h3>
          <button onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-3"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink-muted">Title</label>
            <input
              autoFocus
              value={event.title ?? ""}
              onChange={(e) => onChange({ ...event, title: e.target.value })}
              className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
              placeholder="Event title"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-ink-muted">Start</label>
              <input
                type="datetime-local"
                value={toLocalInput(event.start)}
                onChange={(e) => onChange({ ...event, start: fromLocalInput(e.target.value) })}
                className="w-full rounded-md border border-edge bg-surface-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-ink-muted">End</label>
              <input
                type="datetime-local"
                value={toLocalInput(event.end)}
                onChange={(e) => onChange({ ...event, end: fromLocalInput(e.target.value) })}
                className="w-full rounded-md border border-edge bg-surface-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={event.allDay ?? false}
                onChange={(e) => onChange({ ...event, allDay: e.target.checked })}
                className="accent-accent"
              />
              All day
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-muted">Color</span>
              <input
                type="color"
                value={event.color ?? LAYER_COLORS.events}
                onChange={(e) => onChange({ ...event, color: e.target.value })}
                className="h-6 w-8 cursor-pointer rounded border border-edge"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink-muted">Location</label>
            <input
              value={event.location ?? ""}
              onChange={(e) => onChange({ ...event, location: e.target.value })}
              className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink-muted">Description</label>
            <textarea
              value={event.description ?? ""}
              onChange={(e) => onChange({ ...event, description: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-edge bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onDelete ? (
              <button onClick={onDelete} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-500/10">
                <Trash2 size={13} /> Delete
              </button>
            ) : null}
            {isMicrosoftEvent && (
              <span className="flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-[11px] text-sky-500">
                <Cloud size={12} /> Microsoft
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {onPushToMs && (
              <button onClick={onPushToMs} className="flex items-center gap-1 rounded-md border border-sky-500/40 px-2.5 py-1.5 text-xs text-sky-500 hover:bg-sky-500/10">
                <Cloud size={13} /> Push to MS
              </button>
            )}
            <button onClick={onClose} className="rounded-md border border-edge px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-3">Cancel</button>
            <button onClick={onSave} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

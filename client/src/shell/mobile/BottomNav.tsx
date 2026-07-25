import { CalendarCheck, CheckSquare, StickyNote, Calendar, Sparkles, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import { useWindows, type AppId } from "../../store/windows";
import { useAthenaQuick } from "../../store/athenaQuick";

interface NavSlot {
  appId: AppId;
  label: string;
  icon: React.ReactNode;
}

/** The 4 fixed app slots in the bottom nav. Athena + Apps are special. */
const SLOTS: NavSlot[] = [
  { appId: "today", label: "Today", icon: <CalendarCheck size={22} /> },
  { appId: "tasks", label: "Tasks", icon: <CheckSquare size={22} /> },
  { appId: "notes", label: "Notes", icon: <StickyNote size={22} /> },
  { appId: "calendar", label: "Calendar", icon: <Calendar size={22} /> },
];

interface Props {
  onOpenDrawer: () => void;
}

export default function BottomNav({ onOpenDrawer }: Props) {
  const { mobileActiveId, mobileStack, mobileOnHome, mobileSwitchTo, mobileGoHome } = useWindows();
  const toggleAthena = useAthenaQuick((s) => s.toggle);
  const athenaOpen = useAthenaQuick((s) => s.open);

  const activeAppId = mobileOnHome ? null : mobileStack.find((e) => e.id === mobileActiveId)?.appId;

  const tap = (slot: NavSlot) => {
    if (slot.appId === "today") {
      // Today is the home — go home rather than pushing a new entry.
      mobileGoHome();
      return;
    }
    mobileSwitchTo({ appId: slot.appId, title: slot.label, icon: iconFor(slot.appId) });
  };

  return (
    <nav className="safe-bottom relative z-30 flex shrink-0 items-stretch border-t border-edge bg-surface/95 backdrop-blur-xl">
      {SLOTS.map((slot) => {
        const active = activeAppId === slot.appId;
        return (
          <button
            key={slot.appId}
            onClick={() => tap(slot)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition active:scale-95"
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute top-0 h-0.5 w-8 rounded-full bg-accent"
                transition={{ type: "spring", damping: 28, stiffness: 380 }}
              />
            )}
            <span className={active ? "text-accent" : "text-ink-muted"}>{slot.icon}</span>
            <span
              className={`text-[10px] font-medium ${active ? "text-accent" : "text-ink-muted"}`}
            >
              {slot.label}
            </span>
          </button>
        );
      })}

      {/* Athena — opens the Athena bottom sheet */}
      <button
        onClick={() => toggleAthena()}
        className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition active:scale-95"
      >
        {athenaOpen && (
          <motion.span
            layoutId="nav-active"
            className="absolute top-0 h-0.5 w-8 rounded-full bg-accent"
            transition={{ type: "spring", damping: 28, stiffness: 380 }}
          />
        )}
        <span className={athenaOpen ? "text-accent" : "text-ink-muted"}>
          <Sparkles size={22} />
        </span>
        <span
          className={`text-[10px] font-medium ${athenaOpen ? "text-accent" : "text-ink-muted"}`}
        >
          Athena
        </span>
      </button>

      {/* Apps drawer */}
      <button
        onClick={onOpenDrawer}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-ink-muted transition active:scale-95"
      >
        <LayoutGrid size={22} />
        <span className="text-[10px] font-medium">Apps</span>
      </button>
    </nav>
  );
}

/** Map an appId to its lucide icon name (must match registry). */
export function iconFor(appId: AppId): string {
  const map: Record<AppId, string> = {
    notes: "StickyNote",
    tasks: "CheckSquare",
    files: "Folder",
    settings: "Settings",
    terminal: "Terminal",
    pomodoro: "Timer",
    flashcards: "Brain",
    grades: "GraduationCap",
    vut: "GraduationCap",
    editor: "Code2",
    viewer: "Eye",
    athena: "Sparkles",
    study: "GraduationCap",
    today: "CalendarCheck",
    calendar: "Calendar",
    habits: "Flame",
    whiteboard: "PenTool",
    ntfy: "Bell",
    voice: "Mic",
    browser: "Globe",
    reminders: "BellRing",
  };
  return map[appId];
}

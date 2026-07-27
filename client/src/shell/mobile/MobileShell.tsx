import { useState } from "react";
import { CalendarDays, CheckSquare, Home, MoreHorizontal, Sparkles } from "lucide-react";
import MobileHome from "../../mobile/MobileHome";
import MobileTasks from "../../mobile/MobileTasks";
import MobileCalendar from "../../mobile/MobileCalendar";
import MobileAthena from "../../mobile/MobileAthena";
import MobileLauncher, { type MobileTool } from "../../mobile/MobileLauncher";
import MobileToolPage from "../../mobile/MobileToolPage";

export type MobileRoute = "home" | "tasks" | "calendar" | "athena" | "more";

const TABS: { id: Exclude<MobileRoute, "more">; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "calendar", label: "Plan", icon: CalendarDays },
  { id: "athena", label: "Athena", icon: Sparkles },
];

export default function MobileShell() {
  const [route, setRoute] = useState<MobileRoute>("home");
  const [tool, setTool] = useState<MobileTool | null>(null);

  return (
    <main className="relative flex h-full w-full overflow-hidden bg-slate-950 text-slate-100" aria-label="Athena mobile">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.22),transparent_34%),radial-gradient(circle_at_100%_18%,rgba(14,165,233,.12),transparent_28%)]" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <section className="min-h-0 flex-1 overflow-y-auto pb-24">
          {route === "home" && <MobileHome onNavigate={setRoute} />}
          {route === "tasks" && <MobileTasks />}
          {route === "calendar" && <MobileCalendar />}
          {route === "athena" && <MobileAthena />}
          {route === "more" && <MobileLauncher onClose={() => setRoute("home")} onOpen={(nextTool) => setTool(nextTool)} />}
          {tool && <MobileToolPage tool={tool} onClose={() => setTool(null)} />}
        </section>
        <nav className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl" aria-label="Primary navigation">
          <div className="mx-auto flex max-w-md items-center justify-around">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = route === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRoute(id)}
                  className={`flex min-w-14 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition ${active ? "bg-indigo-500/20 text-indigo-300" : "text-slate-400"}`}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setRoute("more")}
              className={`flex min-w-14 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition ${route === "more" ? "bg-indigo-500/20 text-indigo-300" : "text-slate-400"}`}
            >
              <MoreHorizontal size={20} strokeWidth={route === "more" ? 2.5 : 2} />
              More
            </button>
          </div>
        </nav>
      </div>
    </main>
  );
}

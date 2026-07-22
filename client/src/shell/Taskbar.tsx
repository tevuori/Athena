import { useState, useEffect } from "react";
import * as Lucide from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { useWindows } from "../store/windows";
import { APPS } from "../apps/registry";
import StartMenu from "./StartMenu";
import SystemTray from "./SystemTray";

export default function Taskbar() {
  const { windows, focusedId, restoreOrMinimize, open } = useWindows();
  const [startOpen, setStartOpen] = useState(false);

  // Escape closes the start menu (the Win/Meta key is not bound here because it
  // triggers native OS shortcuts on Linux and other platforms).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStartOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Group windows by appId for taskbar buttons
  const taskbarApps = APPS.filter((a) => windows.some((w) => w.appId === a.id));

  return (
    <>
      <div className="absolute bottom-0 left-0 right-0 z-[10000] flex h-12 items-center gap-1 border-t border-edge bg-surface/80 px-2 backdrop-blur-xl">
        {/* Left: Start button (flex-1 keeps apps centered) */}
        <div className="flex flex-1 items-center gap-1">
          <button
            onClick={() => setStartOpen((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
              startOpen ? "bg-accent text-accent-fg" : "text-ink hover:bg-surface-3"
            }`}
            title="Start"
          >
            <LayoutGrid size={18} />
          </button>
          <div className="mx-1 h-6 w-px bg-edge" />
        </div>

        {/* Center: Pinned + running apps (GNOME-style centered dash) */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {APPS.map((app) => {
            const Icon = (Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>)[app.icon] ?? Lucide.AppWindow;
            const appWindows = windows.filter((w) => w.appId === app.id);
            const isRunning = appWindows.length > 0;
            const isActive = appWindows.some((w) => w.id === focusedId && !w.minimized);
            return (
              <button
                key={app.id}
                onClick={() => {
                  if (appWindows.length === 0) {
                    open({ appId: app.id, title: app.name, icon: app.icon });
                  } else {
                    // Focus the topmost window of this app
                    const top = [...appWindows].sort((a, b) => b.zIndex - a.zIndex)[0];
                    restoreOrMinimize(top.id);
                  }
                }}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  isActive
                    ? "bg-accent/20 text-accent"
                    : isRunning
                    ? "text-ink hover:bg-surface-3"
                    : "text-ink-muted hover:bg-surface-3 hover:text-ink"
                }`}
                title={app.name}
              >
                <Icon size={18} />
                {isRunning && (
                  <span
                    className={`absolute bottom-0.5 left-1/2 h-1 -translate-x-1/2 rounded-full ${
                      isActive ? "w-4 bg-accent" : "w-2 bg-ink-muted"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: System tray (flex-1 keeps apps centered) */}
        <div className="flex flex-1 items-center justify-end">
          <SystemTray />
        </div>
      </div>

      <StartMenu open={startOpen} onClose={() => setStartOpen(false)} />
    </>
  );
}

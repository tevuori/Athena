import { useState } from "react";
import { Bell, Search } from "lucide-react";
import { useWindows, type AppId } from "../../store/windows";
import { useNotifications } from "../../store/notifications";
import { useAthenaQuick } from "../../store/athenaQuick";
import TodayApp from "../../apps/today/TodayApp";
import InstallBanner from "./InstallBanner";

/**
 * The mobile home screen — Today agenda as the home content, with a minimal
 * home header (greeting + search + notification bell). Today itself is the
 * agenda and provides its own pull-to-refresh.
 */
export default function MobileHome({
  onOpenNotifs,
  unread,
}: {
  onOpenNotifs: () => void;
  unread: number;
}) {
  const openWindow = useWindows((s) => s.open);
  const toggleAthena = useAthenaQuick((s) => s.toggle);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const openApp = (appId: AppId, title: string, icon: string) =>
    openWindow({ appId, title, icon });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <InstallBanner />

      {/* Home header */}
      <div className="safe-top flex h-12 shrink-0 items-center gap-2 px-3">
        {searching ? (
          <>
            <Search size={16} className="shrink-0 text-ink-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (!query) setSearching(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  // Reuse the desktop CommandPalette by dispatching its hotkey
                  // with a prefill — simplest path to global search on mobile.
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "k",
                      code: "KeyK",
                      ctrlKey: true,
                      bubbles: true,
                    })
                  );
                  setSearching(false);
                  setQuery("");
                }
                if (e.key === "Escape") {
                  setSearching(false);
                  setQuery("");
                }
              }}
              placeholder="Search Athena..."
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
            <button
              onClick={() => {
                setSearching(false);
                setQuery("");
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
            >
              <span className="text-lg">×</span>
            </button>
          </>
        ) : (
          <>
            <span className="text-base font-semibold text-ink">Athena</span>
            <div className="flex-1" />
            <button
              onClick={() => setSearching(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <button
              onClick={toggleAthena}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-accent active:bg-surface-3"
              aria-label="Athena"
            >
              <span className="text-base">✦</span>
            </button>
            <button
              onClick={onOpenNotifs}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Today agenda as the home content */}
      <div className="relative flex-1 overflow-y-auto @container">
        <TodayApp />
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Lucide from "lucide-react";
import { Search, X } from "lucide-react";
import { APPS } from "../../apps/registry";
import { useWindows, type AppId } from "../../store/windows";

interface Props {
  open: boolean;
  onClose: () => void;
}

const RECENTS_KEY = "athena.mobile-recents";
const MAX_RECENTS = 6;

function loadRecents(): AppId[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw) return JSON.parse(raw) as AppId[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveRecents(ids: AppId[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(ids.slice(0, MAX_RECENTS)));
  } catch {
    /* ignore */
  }
}

export default function AppDrawer({ open, onClose }: Props) {
  const { mobileSwitchTo } = useWindows();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<AppId[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRecents(loadRecents());
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const drawerApps = APPS.filter((a) => !a.hideOnMobile);
  const filtered = query
    ? drawerApps.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    : drawerApps;

  const launch = (id: AppId, name: string, icon: string) => {
    setRecents((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
    mobileSwitchTo({ appId: id, title: name, icon });
    onClose();
  };

  const recentApps = recents
    .map((id) => APPS.find((a) => a.id === id))
    .filter((a): a is (typeof APPS)[number] => Boolean(a) && !a!.hideOnMobile);

  const renderAppButton = (app: (typeof APPS)[number]) => {
    const Icon =
      (Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>)[app.icon] ??
      Lucide.AppWindow;
    return (
      <button
        key={app.id}
        onClick={() => launch(app.id, app.name, app.icon)}
        className="flex flex-col items-center gap-1.5 rounded-2xl p-2 active:bg-surface-2"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
          <Icon size={26} />
        </div>
        <span className="line-clamp-1 text-[11px] font-medium text-ink">{app.name}</span>
      </button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            className="safe-bottom absolute inset-x-0 bottom-0 z-50 flex max-h-[85%] flex-col rounded-t-2xl border-t border-edge bg-surface shadow-window"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-surface-3" />
            </div>

            {/* Header + search */}
            <div className="safe-top flex items-center gap-2 px-4 pb-2 pt-3">
              <Search size={18} className="shrink-0 text-ink-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search apps..."
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
              />
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
              >
                <X size={18} />
              </button>
            </div>

            {/* App grid */}
            <div className="flex-1 overflow-y-auto p-3">
              {!query && recentApps.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Recents
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {recentApps.map(renderAppButton)}
                  </div>
                  <div className="my-3 h-px bg-edge" />
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {filtered.map(renderAppButton)}
                {filtered.length === 0 && (
                  <p className="col-span-4 py-8 text-center text-sm text-ink-muted">
                    No apps found
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Bell, BellOff, X } from "lucide-react";
import { useNotifications } from "../../store/notifications";
import { useSettings } from "../../store/settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Mobile notification + DND bottom sheet. Replaces the desktop system tray
 * notification popover. Each notification can be swiped left to dismiss.
 * Volume/wifi/battery are dropped on mobile (use the native status bar).
 */
export default function NotificationSheet({ open, onClose }: Props) {
  const { items, unreadCount, markRead, dismiss, clearAll } = useNotifications();
  const { doNotDisturb, setDoNotDisturb, notificationsEnabled } = useSettings();
  const unread = unreadCount();

  const onSwipeEnd = (id: string, info: PanInfo) => {
    if (info.offset.x < -80 || info.velocity.x < -500) dismiss(id);
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
            className="safe-bottom absolute inset-x-0 bottom-0 z-50 flex max-h-[75%] flex-col rounded-t-2xl border-t border-edge bg-surface shadow-window"
          >
            <div className="flex justify-center pt-2">
              <div className="h-1 w-10 rounded-full bg-surface-3" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">Notifications</span>
                {unread > 0 && (
                  <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-fg">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDoNotDisturb(!doNotDisturb)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    doNotDisturb ? "bg-accent/20 text-accent" : "text-ink-muted active:bg-surface-3"
                  }`}
                  title="Do not disturb"
                >
                  {doNotDisturb || !notificationsEnabled ? <BellOff size={16} /> : <Bell size={16} />}
                </button>
                {items.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[11px] text-accent active:opacity-70"
                  >
                    Clear all
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
              {items.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">No notifications</p>
              ) : (
                items.map((n) => (
                  <motion.div
                    key={n.id}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={{ left: 0.6, right: 0 }}
                    onDragEnd={(_, info) => onSwipeEnd(n.id, info)}
                    className={`rounded-lg border p-3 text-left transition ${
                      n.read ? "border-edge bg-surface" : "border-accent/30 bg-accent/5"
                    }`}
                    onClick={() => markRead(n.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{n.title}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{n.body}</p>
                        <p className="mt-1 text-[10px] text-ink-muted/70">{n.app}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(n.id);
                        }}
                        className="text-ink-muted active:text-ink"
                      >
                        <span className="text-lg">×</span>
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

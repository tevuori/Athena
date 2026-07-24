import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import Wallpaper from "../Wallpaper";
import MobileAppFrame from "./MobileAppFrame";
import BottomNav from "./BottomNav";
import AppDrawer from "./AppDrawer";
import AthenaSheet from "./AthenaSheet";
import QuickCaptureFab from "./QuickCaptureFab";
import MiniPlayer from "./MiniPlayer";
import NotificationSheet from "./NotificationSheet";
import QuickCapture from "../QuickCapture";
import { useWindows, type MobileAppEntry } from "../../store/windows";
import { useNotifications } from "../../store/notifications";
import TodayApp from "../../apps/today/TodayApp";
import InstallBanner from "./InstallBanner";

/**
 * Mobile shell — phone form factor.
 *
 * Replaces the desktop metaphor with a single-active-app navigation model:
 *   - Today agenda as the home screen
 *   - bottom nav (Today / Tasks / Notes / Athena / Apps drawer)
 *   - one app rendered full-bleed at a time (mobile app stack)
 *   - Athena as a bottom sheet
 *   - Quick Capture FAB
 *   - mini music player above the bottom nav
 *   - notification sheet
 *
 * Browser back button / iOS edge-swipe pops the app stack via history integration.
 */
export default function MobileShell() {
  const {
    mobileStack,
    mobileActiveId,
    mobileOnHome,
    mobileBack,
    mobileGoHome,
  } = useWindows();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = useNotifications((s) => s.unreadCount());

  const activeEntry: MobileAppEntry | null =
    !mobileOnHome && mobileActiveId
      ? mobileStack.find((e) => e.id === mobileActiveId) ?? null
      : null;

  // ===== Browser history integration for back gesture =====
  // Push a history entry whenever an app is opened; pop on back.
  useEffect(() => {
    const onPop = () => {
      // Browser back → go back one level in the mobile stack, else stay home.
      if (!useWindows.getState().mobileOnHome) {
        mobileBack();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mobileBack]);

  // Push a history state when entering an app so the hardware back button works.
  useEffect(() => {
    if (!mobileOnHome) {
      window.history.pushState({ athenaMobile: true }, "");
    }
  }, [mobileOnHome, mobileActiveId]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface text-ink">
      <Wallpaper />

      {/* Main content area: Today home or the active app */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {activeEntry ? (
          <MobileAppFrame key={activeEntry.id} entry={activeEntry} />
        ) : (
          <MobileHome onOpenNotifs={() => setNotifOpen(true)} unread={unread} />
        )}
      </div>

      {/* Mini player (auto-hides when no music) */}
      <div className="relative z-20">
        <MiniPlayer />
      </div>

      {/* Bottom navigation */}
      <BottomNav onOpenDrawer={() => setDrawerOpen(true)} />

      {/* FAB — hidden when an overlay (drawer/athena/notif) is open */}
      {!drawerOpen && <QuickCaptureFab />}

      {/* Overlays */}
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <AthenaSheet />
      <NotificationSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      <QuickCapture />
    </div>
  );
}

/**
 * The mobile home screen — renders the Today app full-bleed with a minimal
 * home header (greeting + notification bell). Today itself is the agenda.
 */
function MobileHome({ onOpenNotifs, unread }: { onOpenNotifs: () => void; unread: number }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* PWA install prompt */}
      <InstallBanner />
      {/* Home header */}
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <span className="text-sm font-semibold text-ink">Athena</span>
        <button
          onClick={onOpenNotifs}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
      {/* Today agenda as the home content */}
      <div className="relative flex-1 overflow-y-auto @container">
        <TodayApp />
      </div>
    </div>
  );
}

import { useState } from "react";
import Wallpaper from "../Wallpaper";
import MobileNavigator from "./MobileNavigator";
import BottomNav from "./BottomNav";
import AppDrawer from "./AppDrawer";
import AthenaSheet from "./AthenaSheet";
import NowPlayingSheet from "./NowPlayingSheet";
import QuickCaptureFab from "./QuickCaptureFab";
import MiniPlayer from "./MiniPlayer";
import NotificationSheet from "./NotificationSheet";
import QuickCapture from "../QuickCapture";

/**
 * Mobile shell — phone form factor.
 *
 * Replaces the desktop metaphor with a single-active-app navigation model:
 *   - Today agenda as the home screen
 *   - bottom nav (Today / Tasks / Notes / Calendar / Athena / Apps drawer)
 *   - one app rendered full-bleed at a time (mobile app stack) with native
 *     slide transitions (MobileNavigator)
 *   - Athena as a draggable bottom sheet with snap detents
 *   - Now Playing sheet expanding from the MiniPlayer
 *   - Quick Capture FAB
 *   - notification sheet (swipe-to-dismiss)
 *
 * Browser back button / iOS edge-swipe pops the app stack via history
 * integration (handled in MobileNavigator).
 */
export default function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface text-ink">
      <Wallpaper />

      {/* Main content area: home or the active app, with slide transitions */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <MobileNavigator onOpenNotifs={() => setNotifOpen(true)} />
      </div>

      {/* Mini player (auto-hides when no music) */}
      <div className="relative z-20">
        <MiniPlayer />
      </div>

      {/* Bottom navigation */}
      <BottomNav onOpenDrawer={() => setDrawerOpen(true)} />

      {/* FAB — hidden when an overlay is open */}
      {!drawerOpen && <QuickCaptureFab />}

      {/* Overlays */}
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <AthenaSheet />
      <NowPlayingSheet />
      <NotificationSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      <QuickCapture />
    </div>
  );
}

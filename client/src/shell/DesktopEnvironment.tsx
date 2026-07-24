import Wallpaper from "./Wallpaper";
import MusicWidget from "./MusicWidget";
import Desktop from "./Desktop";
import Taskbar from "./Taskbar";
import WindowLayer from "../wm/WindowLayer";
import SnapPreview from "../wm/SnapPreview";
import AltTabSwitcher from "../wm/AltTabSwitcher";
import CommandPalette from "./CommandPalette";
import QuickCapture from "./QuickCapture";
import AthenaQuickPanel from "./AthenaQuickPanel";
import OnboardingOverlay from "./OnboardingOverlay";
import { useWindows } from "../store/windows";
import { useAthenaQuick } from "../store/athenaQuick";
import { useSettings } from "../store/settings";
import { useEffect } from "react";

export default function DesktopEnvironment() {
  const { open, focusedId, snap, toggleMaximize, close } = useWindows();
  const toggleAthenaQuick = useAthenaQuick((s) => s.toggle);
  const hasOnboarded = useSettings((s) => s.hasOnboarded);

  // Win + Y → toggle Athena quick panel (rolls in from the selected edge)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        toggleAthenaQuick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleAthenaQuick]);

  // Win + F → toggle true fullscreen via the Fullscreen API.
  // Unlike F11, Firefox does not reveal its toolbar on cursor hover when
  // fullscreen is entered via the API, so this is a kiosk-style fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keyboard shortcuts for window management
  //   Win + Arrow keys  → snap to grid zones
  //   Win + Shift+Up    → maximize/restore
  //   Win + Shift+Down  → minimize
  //   Win + W           → close focused window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Require Meta (Win/Cmd) key for window shortcuts
      if (!e.metaKey && !e.ctrlKey) return;
      // Don't interfere when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (!focusedId) return;

      const key = e.key;
      // Win + Arrow keys (with Shift for quadrants)
      if (key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        snap(focusedId, "top-left");
      } else if (key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        snap(focusedId, "top-right");
      } else if (key === "ArrowLeft") {
        e.preventDefault();
        snap(focusedId, "left");
      } else if (key === "ArrowRight") {
        e.preventDefault();
        snap(focusedId, "right");
      } else if (key === "ArrowUp" && e.shiftKey) {
        e.preventDefault();
        toggleMaximize(focusedId);
      } else if (key === "ArrowUp") {
        e.preventDefault();
        snap(focusedId, "maximized");
      } else if (key === "ArrowDown" && e.shiftKey) {
        e.preventDefault();
        useWindows.getState().minimize(focusedId);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        // Restore from maximized/snap, or minimize if already normal
        const w = useWindows.getState().windows.find((x) => x.id === focusedId);
        if (w && w.snap !== "none") {
          snap(focusedId, "none");
        }
      } else if (key === "w" || key === "W") {
        e.preventDefault();
        close(focusedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, snap, toggleMaximize, close]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Wallpaper />
      <MusicWidget />
      <Desktop />
      <WindowLayer />
      <AthenaQuickPanel />
      <SnapPreview />
      <Taskbar />
      <AltTabSwitcher />
      <CommandPalette />
      <QuickCapture />
      {!hasOnboarded && <OnboardingOverlay />}
    </div>
  );
}

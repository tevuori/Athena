import Wallpaper from "./Wallpaper";
import Desktop from "./Desktop";
import Taskbar from "./Taskbar";
import WindowLayer from "../wm/WindowLayer";
import SnapPreview from "../wm/SnapPreview";
import AltTabSwitcher from "../wm/AltTabSwitcher";
import CommandPalette from "./CommandPalette";
import { useWindows } from "../store/windows";
import { useEffect } from "react";

export default function DesktopEnvironment() {
  const { open, focusedId, snap, toggleMaximize, close } = useWindows();

  // Open a welcome window on first load if none open
  useEffect(() => {
    const t = setTimeout(() => {
      if (useWindows.getState().windows.length === 0) {
        open({ appId: "notes", title: "Notes", icon: "StickyNote" });
      }
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

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
      <Desktop />
      <WindowLayer />
      <SnapPreview />
      <Taskbar />
      <AltTabSwitcher />
      <CommandPalette />
    </div>
  );
}

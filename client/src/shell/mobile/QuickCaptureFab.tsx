import { Zap } from "lucide-react";

/**
 * Floating Action Button for Quick Capture on mobile.
 * Sits above the bottom nav, bottom-right.
 * Triggers the existing QuickCapture overlay via its Ctrl+Shift+N hotkey
 * (same mechanism the desktop CommandPalette uses), so no logic is duplicated.
 *
 * A long-press → voice mode enhancement is planned (Phase: polish); for now
 * it opens the text+voice capture overlay which already supports mic input.
 */
export default function QuickCaptureFab() {
  const onClick = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "N",
        code: "KeyN",
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg active:scale-95"
      title="Quick Capture"
      aria-label="Quick Capture"
    >
      <Zap size={24} />
    </button>
  );
}

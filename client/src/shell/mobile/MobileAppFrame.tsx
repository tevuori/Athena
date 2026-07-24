import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { useWindows, type WindowInstance, type MobileAppEntry } from "../../store/windows";
import { APP_MAP } from "../../apps/registry";

/**
 * Wraps a single mobile app entry with a consistent mobile chrome:
 *   - header (back chevron, app icon + title)
 *   - full-bleed content area (an @container so existing container-query
 *     breakpoints inside apps keep working at phone width)
 *   - safe-area padding
 *
 * Apps flagged `fullscreenOnMobile` in the registry skip the frame and render
 * their own chrome (Viewer, Whiteboard).
 */
export default function MobileAppFrame({ entry }: { entry: MobileAppEntry }) {
  const def = APP_MAP[entry.appId];
  const { mobileBack, mobileStack } = useWindows();
  const App = def?.component;

  // Construct a synthetic WindowInstance so app components that read `win`
  // (e.g. payload, setTitle) keep working without changes.
  const win = useMemo<WindowInstance>(
    () => ({
      id: entry.id,
      appId: entry.appId,
      title: entry.title,
      icon: entry.icon,
      rect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      snap: "maximized",
      zIndex: 1,
      minimized: false,
      closing: false,
      payload: entry.payload,
    }),
    [entry]
  );

  if (!App) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
        Unknown app: {entry.appId}
      </div>
    );
  }

  // Fullscreen apps render without the standard frame.
  if (def?.fullscreenOnMobile) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <App win={win} />
      </div>
    );
  }

  const stackDepth = mobileStack.length;
  const showBack = stackDepth > 1;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Mobile app header */}
      <div className="safe-top flex h-12 shrink-0 items-center gap-2 border-b border-edge bg-surface-2 px-1">
        {showBack ? (
          <button
            onClick={() => mobileBack()}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-surface-3 active:bg-surface-3"
            title="Back"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="w-2" />
        )}
        <div className="flex flex-1 items-center justify-center">
          <span className="truncate text-sm font-semibold text-ink">{entry.title}</span>
        </div>
        {/* Spacer to balance the back button so the title stays centered */}
        <div className="w-10" />
      </div>

      {/* Content — an @container so app container-query breakpoints resolve
          against the phone width (sidebars collapse to overlays automatically). */}
      <div className="relative flex-1 overflow-hidden bg-surface @container">
        <App win={win} />
      </div>
    </div>
  );
}

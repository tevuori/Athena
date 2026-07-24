import { useRef, useCallback, type MouseEvent } from "react";
import type { MenuItem } from "./ContextMenu";

/**
 * Hook that returns an `onContextMenu`-compatible handler plus a touch
 * long-press handler. On touch devices, HTML5 `contextmenu` doesn't fire, so
 * apps attach `onPointerDown`/`onPointerUp`/`onPointerMove`/`onPointerLeave`
 * to the same element to detect a long-press and open the menu at the touch
 * point. On desktop, the existing `onContextMenu` (right-click) is used.
 *
 * Usage:
 *   const longPress = useLongPressMenu(() => setMenu({ x, y, items }));
 *   <div
 *     onContextMenu={longPress.onContextMenu}
 *     onPointerDown={longPress.onPointerDown}
 *     onPointerUp={longPress.onPointerUp}
 *     onPointerMove={longPress.onPointerMove}
 *     onPointerLeave={longPress.onPointerLeave}
 *   />
 *
 * The callback receives the {x, y} screen coordinates to open the menu at.
 */
export function useLongPressMenu(onOpen: (pos: { x: number; y: number }) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      // Desktop right-click — use as-is.
      e.preventDefault();
      onOpen({ x: e.clientX, y: e.clientY });
    },
    [onOpen]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      startPos.current = { x: e.clientX, y: e.clientY };
      longPressed.current = false;
      clear();
      timer.current = setTimeout(() => {
        longPressed.current = true;
        // Open at the touch start position (more predictable than current).
        const pos = startPos.current ?? { x: e.clientX, y: e.clientY };
        onOpen(pos);
      }, 500);
    },
    [clear, onOpen]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" || !startPos.current) return;
      // Cancel if the finger moves more than a small tolerance (it's a scroll,
      // not a long-press).
      const dx = Math.abs(e.clientX - startPos.current.x);
      const dy = Math.abs(e.clientY - startPos.current.y);
      if (dx > 10 || dy > 10) clear();
    },
    [clear]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      clear();
    },
    [clear]
  );

  const onPointerLeave = useCallback(() => {
    clear();
  }, [clear]);

  /** Whether the most recent touch interaction was a long-press (so callers
   *  can suppress the subsequent click). */
  const wasLongPress = useCallback(() => longPressed.current, []);

  return {
    onContextMenu,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerLeave,
    wasLongPress,
  };
}

export type { MenuItem };

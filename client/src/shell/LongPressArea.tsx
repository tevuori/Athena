import { useRef, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Called with screen coordinates when a context menu should open — either
   *  via right-click (desktop) or long-press (touch). */
  onMenu: (pos: { x: number; y: number }) => void;
  /** Optional: prevent the default click after a long-press fires. */
  preventClickAfterLongPress?: boolean;
  className?: string;
  /** Pass through onClick (will be suppressed if it immediately follows a long-press). */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Wraps children with both desktop right-click and mobile long-press support
 * for triggering a context menu. Use around any element that has an
 * `onContextMenu`-based menu so it also works on touch.
 *
 * On touch: press-and-hold ~500ms without moving >10px fires `onMenu`.
 * On desktop: right-click fires `onMenu`.
 */
export default function LongPressArea({
  children,
  onMenu,
  preventClickAfterLongPress = true,
  className,
  onClick,
}: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onMenu({ x: e.clientX, y: e.clientY });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    longPressed.current = false;
    clear();
    timer.current = setTimeout(() => {
      longPressed.current = true;
      const pos = startPos.current ?? { x: e.clientX, y: e.clientY };
      onMenu(pos);
    }, 500);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 10 || dy > 10) clear();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    clear();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (preventClickAfterLongPress && longPressed.current) {
      longPressed.current = false;
      return;
    }
    onClick?.(e);
  };

  return (
    <div
      className={className}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={clear}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

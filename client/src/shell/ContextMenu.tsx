import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFormFactor } from "../store/formfactor";

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  separator?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** When true, the menu stays open after onClick (e.g. submenu navigation). */
  keepOpen?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isPhone = useFormFactor((s) => s.mode === "phone");

  useEffect(() => {
    // pointerdown covers both mouse and touch.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const nonSeparator = items.filter((i) => !i.separator);

  // ===== Mobile: bottom sheet =====
  if (isPhone) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[12000] bg-black/40"
          onClick={onClose}
        />
        <motion.div
          ref={ref}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          className="safe-bottom fixed inset-x-0 bottom-0 z-[12001] rounded-t-2xl border-t border-edge bg-surface-2 p-2 shadow-window"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-surface-3" />
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1 h-px bg-edge" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  if (!item.keepOpen) onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                  item.disabled
                    ? "cursor-not-allowed text-ink-muted/50"
                    : item.danger
                    ? "text-red-400 active:bg-red-500/15"
                    : "text-ink active:bg-surface-3"
                }`}
              >
                {item.icon && <span className="text-ink-muted">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            )
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // ===== Desktop: floating menu at (x, y) =====
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(x, vw - 220);
  const top = Math.min(y, vh - nonSeparator.length * 32 - 16);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="fixed z-[12000] min-w-[200px] rounded-lg border border-edge bg-surface-2 p-1.5 shadow-window animate-scale-in"
      style={{ left, top }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="my-1 h-px bg-edge" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              if (!item.keepOpen) onClose();
            }}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition ${
              item.disabled
                ? "cursor-not-allowed text-ink-muted/50"
                : item.danger
                ? "text-red-400 hover:bg-red-500/15"
                : "text-ink hover:bg-surface-3"
            }`}
          >
            {item.icon && <span className="text-ink-muted">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}

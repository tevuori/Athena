import { useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { X, Expand, ChevronDown } from "lucide-react";
import AthenaApp from "../../apps/athena/AthenaApp";
import { useAthenaQuick } from "../../store/athenaQuick";
import { useWindows } from "../../store/windows";

/**
 * Athena as a mobile bottom sheet with three snap detents:
 *   - peek  (~40%) — quick prompt
 *   - half  (~70%) — comfortable chat
 *   - full  (~92%) — immersive
 *
 * Drag the handle to move between detents. Tap backdrop / X / drag down past
 * peek to close. "Expand" opens the full Athena app in the mobile app stack.
 */
const DETENTS = [
  { key: "peek", height: "40%" },
  { key: "half", height: "70%" },
  { key: "full", height: "92%" },
] as const;
type DetentKey = (typeof DETENTS)[number]["key"];

export default function AthenaSheet() {
  const open = useAthenaQuick((s) => s.open);
  const setOpen = useAthenaQuick((s) => s.setOpen);
  const { mobileSwitchTo } = useWindows();
  const [detent, setDetent] = useState<DetentKey>("half");

  const handleExpand = () => {
    setOpen(false);
    mobileSwitchTo({ appId: "athena", title: "Athena", icon: "Sparkles" });
  };

  const heightFor = (k: DetentKey) => DETENTS.find((d) => d.key === k)!.height;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const vy = info.velocity.y;
    const dy = info.offset.y;
    const order: DetentKey[] = ["full", "half", "peek"];
    const idx = order.indexOf(detent);
    if (vy > 600 || dy > 120) {
      // Dragging down → lower detent or close
      if (idx === order.length - 1 && (vy > 900 || dy > 200)) {
        setOpen(false);
      } else if (idx < order.length - 1) {
        setDetent(order[idx + 1]);
      } else {
        setOpen(false);
      }
    } else if (vy < -600 || dy < -120) {
      // Dragging up → higher detent
      if (idx > 0) setDetent(order[idx - 1]);
    }
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
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 360 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            style={{ height: heightFor(detent) }}
            className="safe-bottom absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-edge bg-surface shadow-window"
          >
            {/* Drag handle + actions */}
            <div className="safe-top relative flex items-center justify-between px-3 pt-2">
              <button
                onClick={() => setDetent((d) => (d === "full" ? "half" : d === "half" ? "peek" : "half"))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
                title="Collapse"
              >
                <ChevronDown size={18} />
              </button>
              <div className="h-1 w-10 rounded-full bg-surface-3" />
              <div className="flex items-center gap-1">
                <button
                  onClick={handleExpand}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
                  title="Expand to full app"
                >
                  <Expand size={16} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted active:bg-surface-3"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <AthenaApp mode="quick" onExpand={handleExpand} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

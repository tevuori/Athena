import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import AthenaApp from "../../apps/athena/AthenaApp";
import { useAthenaQuick } from "../../store/athenaQuick";
import { useWindows } from "../../store/windows";

/**
 * Athena as a mobile bottom sheet. Reuses AthenaApp in `mode="quick"`.
 * Three detents would be ideal; for now a single near-full sheet.
 * Tap backdrop or the X to close. "Expand" opens the full Athena app
 * in the mobile app stack.
 */
export default function AthenaSheet() {
  const open = useAthenaQuick((s) => s.open);
  const setOpen = useAthenaQuick((s) => s.setOpen);
  const { mobileSwitchTo } = useWindows();

  const handleExpand = () => {
    setOpen(false);
    mobileSwitchTo({ appId: "athena", title: "Athena", icon: "Sparkles" });
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
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="safe-bottom absolute inset-x-0 bottom-0 z-50 flex h-[85%] flex-col rounded-t-2xl border-t border-edge bg-surface shadow-window"
          >
            {/* Drag handle + close */}
            <div className="flex items-center justify-between px-3 pt-2">
              <div className="mx-auto h-1 w-10 rounded-full bg-surface-3" />
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-3"
              >
                <X size={18} />
              </button>
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

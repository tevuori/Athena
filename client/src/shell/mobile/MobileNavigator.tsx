import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWindows, type MobileAppEntry } from "../../store/windows";
import MobileHome from "./MobileHome";
import MobileAppFrame from "./MobileAppFrame";
import { useNotifications } from "../../store/notifications";

/**
 * The mobile navigation container.
 *
 * Renders either the home (Today) or the active app, with direction-aware
 * slide transitions between stack levels — opening an app slides in from the
 * right, going back slides out to the right, like a native navigator.
 *
 * Keeps the existing `mobileStack` / `mobileActiveId` / `mobileOnHome` model
 * in the windows store + browser history integration for the back gesture.
 */
export default function MobileNavigator({
  onOpenNotifs,
}: {
  onOpenNotifs: () => void;
}) {
  const { mobileStack, mobileActiveId, mobileOnHome, mobileBack } = useWindows();
  const unread = useNotifications((s) => s.unreadCount());

  const activeEntry: MobileAppEntry | null =
    !mobileOnHome && mobileActiveId
      ? mobileStack.find((e) => e.id === mobileActiveId) ?? null
      : null;

  // Track stack depth to determine slide direction (forward = deeper).
  const prevDepth = useRef(mobileOnHome ? 0 : mobileStack.length);
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    const depth = mobileOnHome ? 0 : mobileStack.length;
    setDirection(depth >= prevDepth.current ? 1 : -1);
    prevDepth.current = depth;
  }, [mobileOnHome, mobileStack.length]);

  // Browser history integration for hardware back / iOS edge-swipe.
  useEffect(() => {
    const onPop = () => {
      if (!useWindows.getState().mobileOnHome) {
        mobileBack();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mobileBack]);

  // Push a history entry whenever an app is opened so the back button works.
  useEffect(() => {
    if (!mobileOnHome) {
      window.history.pushState({ athenaMobile: true }, "");
    }
  }, [mobileOnHome, mobileActiveId]);

  // A stable key per rendered screen so AnimatePresence can animate in/out.
  const screenKey = activeEntry ? `app-${activeEntry.id}` : "home";

  return (
    <div className="relative flex-1 overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={screenKey}
          custom={direction}
          initial={{ x: direction === 1 ? "100%" : "-25%", opacity: direction === 1 ? 1 : 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction === 1 ? "-25%" : "100%", opacity: direction === 1 ? 0 : 1 }}
          transition={{ type: "tween", duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0 flex flex-col"
        >
          {activeEntry ? (
            <MobileAppFrame key={activeEntry.id} entry={activeEntry} />
          ) : (
            <MobileHome onOpenNotifs={onOpenNotifs} unread={unread} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

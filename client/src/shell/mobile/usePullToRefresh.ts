import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Lightweight pull-to-refresh for a scroll container.
 *
 * Attach the returned `bind` handlers to a scrollable element. When the user
 * pulls down past `threshold` while at scrollTop === 0, `onRefresh` is called.
 * A spinner indicator is returned as `pulling`/`distance` for rendering.
 *
 * Only activates on touch pointers; mouse is ignored.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, threshold = 70) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = ref.current;
    if (!el || el.scrollTop > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
    pulling.current = false;
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (distance !== 0) setDistance(0);
        return;
      }
      // Resistance so it gets harder to pull further.
      const resisted = Math.min(dy * 0.5, threshold * 1.5);
      pulling.current = resisted > threshold;
      setDistance(resisted);
    },
    [distance, refreshing, threshold]
  );

  const onTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pulling.current && !refreshing) {
      setRefreshing(true);
      setDistance(threshold);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setDistance(0);
      }
    } else {
      setDistance(0);
    }
  }, [onRefresh, refreshing, threshold]);

  // Reset on unmount
  useEffect(() => () => setDistance(0), []);

  return {
    ref,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
    distance,
    refreshing,
    /** 0–1 progress toward the threshold (for spinner rotation/opacity). */
    progress: Math.min(1, distance / threshold),
  };
}

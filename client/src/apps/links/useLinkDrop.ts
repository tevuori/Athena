import { useState, useCallback, useRef } from "react";
import type { LinkType } from "../../types";
import { allowLinkDrop, readLinkPayload, type LinkPayload } from "./linkDnd";

interface DropHandlers {
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface UseLinkDropResult extends DropHandlers {
  /** True while a valid link payload is being dragged over the target. */
  isOver: boolean;
}

/**
 * Wire up a drop target that accepts cross-window link payloads and creates
 * a link to (targetType, targetId). Self-links and same-pair duplicates are
 * ignored (the API dedupes; useLinks.add also guards self-links).
 *
 * @param targetType  the entity type of the drop target (e.g. "task")
 * @param targetId    the entity id of the drop target
 * @param onDropped   optional callback after a link is created (e.g. refresh)
 */
export function useLinkDrop(
  targetType: LinkType,
  targetId: string | undefined,
  onDropped?: (payload: LinkPayload) => void
): UseLinkDropResult {
  const [isOver, setIsOver] = useState(false);
  // Counter to handle nested dragenter/dragleave events correctly.
  const depthRef = useRef(0);

  const onDragOver = useCallback((e: React.DragEvent) => {
    allowLinkDrop(e);
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!readLinkPayload(e)) return;
    depthRef.current += 1;
    setIsOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!readLinkPayload(e)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setIsOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const payload = readLinkPayload(e);
      if (!payload || !targetId) return;
      e.preventDefault();
      e.stopPropagation();
      depthRef.current = 0;
      setIsOver(false);
      // Ignore self-link.
      if (payload.type === targetType && payload.id === targetId) return;
      onDropped?.(payload);
    },
    [targetType, targetId, onDropped]
  );

  return { onDragOver, onDragEnter, onDragLeave, onDrop, isOver };
}

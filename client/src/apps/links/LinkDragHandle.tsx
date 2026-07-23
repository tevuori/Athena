import { Link2 } from "lucide-react";
import type { LinkType } from "../../types";
import { setLinkPayload } from "./linkDnd";

interface Props {
  type: LinkType;
  id: string;
  title: string;
  /** Optional className for sizing/positioning. */
  className?: string;
  /** Size of the icon. */
  size?: number;
  /** Accessible label. */
  label?: string;
}

/**
 * A small chain-icon drag handle that initiates a cross-window link drag.
 * Uses native HTML5 draggable (not @dnd-kit), so it works across windows.
 * `onPointerDown` stopPropagation prevents it from hijacking parent
 * @dnd-kit sortable listeners or click handlers.
 */
export default function LinkDragHandle({
  type,
  id,
  title,
  className = "",
  size = 12,
  label = "Drag to link",
}: Props) {
  return (
    <span
      role="button"
      aria-label={label}
      title={label}
      draggable
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.stopPropagation();
        setLinkPayload(e, { type, id, title });
      }}
      className={`inline-flex cursor-grab items-center text-ink-muted opacity-0 transition hover:text-accent active:cursor-grabbing group-hover:opacity-100 ${className}`}
    >
      <Link2 size={size} />
    </span>
  );
}

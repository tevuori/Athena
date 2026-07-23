import { useState, useEffect, useCallback, useRef } from "react";
import { linksApi } from "../../services/links";
import type { LinkType, LinkedItem } from "../../types";

interface LinksState {
  links: LinkedItem[];
  loading: boolean;
  count: number;
  refresh: () => Promise<void>;
  /** Optimistically add a link to a just-dropped item, then persist. */
  add: (other: { type: LinkType; id: string; title: string }) => Promise<void>;
  remove: (linkId: string) => Promise<void>;
}

/**
 * Fetch + manage links attached to a single workspace item.
 * Re-fetches when (type, id) changes.
 */
export function useLinks(
  type: LinkType,
  id: string | undefined,
  refreshSignal?: number
): LinksState {
  const [links, setLinks] = useState<LinkedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const currentKey = `${type}:${id ?? ""}`;
  const lastKeyRef = useRef(currentKey);

  const refresh = useCallback(async () => {
    if (!id) {
      setLinks([]);
      return;
    }
    setLoading(true);
    try {
      const { links } = await linksApi.list(type, id);
      // Guard against stale responses if (type,id) changed during fetch.
      if (lastKeyRef.current === `${type}:${id}`) setLinks(links);
    } catch (e) {
      console.error("Failed to load links", e);
    } finally {
      if (lastKeyRef.current === `${type}:${id}`) setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    lastKeyRef.current = currentKey;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, refresh, refreshSignal]);

  const add = useCallback(
    async (other: { type: LinkType; id: string; title: string }) => {
      if (!id) return;
      if (other.type === type && other.id === id) return; // ignore self-link
      // Optimistic: show immediately if not already present.
      setLinks((prev) =>
        prev.some((l) => l.type === other.type && l.refId === other.id)
          ? prev
          : [
              { id: "__pending__", type: other.type, refId: other.id, title: other.title },
              ...prev,
            ]
      );
      try {
        const { link } = await linksApi.create(other.type, other.id, type, id);
        // Replace the pending placeholder with the real row id.
        setLinks((prev) =>
          prev.map((l) =>
            l.id === "__pending__" && l.type === other.type && l.refId === other.id
              ? { ...l, id: link.id }
              : l
          )
        );
      } catch (e) {
        // Roll back on failure.
        setLinks((prev) =>
          prev.filter(
            (l) => !(l.id === "__pending__" && l.type === other.type && l.refId === other.id)
          )
        );
        console.error("Failed to create link", e);
      }
    },
    [type, id]
  );

  const remove = useCallback(async (linkId: string) => {
    // Optimistic removal.
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    try {
      await linksApi.delete(linkId);
    } catch (e) {
      console.error("Failed to remove link", e);
      void refresh(); // restore on failure
    }
  }, [refresh]);

  return { links, loading, count: links.length, refresh, add, remove };
}

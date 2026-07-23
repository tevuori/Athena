import { api } from "./api";
import type { LinkType, LinkedItem } from "../types";

export const linksApi = {
  list: (type: LinkType, id: string) =>
    api.get<{ links: LinkedItem[] }>(`/api/links?type=${type}&id=${id}`),
  create: (srcType: LinkType, srcId: string, dstType: LinkType, dstId: string) =>
    api.post<{ link: { id: string } }>("/api/links", { srcType, srcId, dstType, dstId }),
  delete: (id: string) => api.delete(`/api/links/${id}`),
};

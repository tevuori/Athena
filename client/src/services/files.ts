import { api } from "./api";
import type { VFile, VFolder } from "../types";

export const filesApi = {
  listFolders: (parentId?: string | null) =>
    api.get<{ folders: VFolder[] }>(
      `/api/files/folders${parentId !== undefined ? `?parentId=${parentId === null ? "null" : parentId}` : ""}`
    ),
  createFolder: (data: { name: string; parentId?: string | null }) =>
    api.post<{ folder: VFolder }>("/api/files/folders", data),
  deleteFolder: (id: string) => api.delete(`/api/files/folders/${id}`),

  list: (folderId?: string | null) =>
    api.get<{ files: VFile[] }>(
      `/api/files${folderId !== undefined ? `?folderId=${folderId === null ? "null" : folderId}` : ""}`
    ),
  upload: (file: File, folderId?: string | null) => {
    const fd = new FormData();
    fd.append("file", file);
    if (folderId) fd.append("folderId", folderId);
    return api.post<{ file: VFile }>("/api/files/upload", fd);
  },
  downloadUrl: (id: string) => `/api/files/${id}/download`,
  download: (id: string) => api.raw(`/api/files/${id}/download`),
  delete: (id: string) => api.delete(`/api/files/${id}`),
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function fileIconColor(mime: string): string {
  if (mime.startsWith("image/")) return "text-green-400";
  if (mime === "application/pdf") return "text-red-400";
  if (mime.startsWith("text/")) return "text-blue-400";
  if (mime.includes("zip") || mime.includes("compressed")) return "text-amber-400";
  return "text-ink-muted";
}

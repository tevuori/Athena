import { useCallback, useEffect, useRef, useState } from "react";
import { Folder, FolderOpen, MoreVertical, Plus, Search, Star, Trash2, Upload } from "lucide-react";
import { filesApi, formatBytes, isTextFile } from "../services/files";
import type { VFile, VFolder } from "../types";
import { MobileContainer, MobileEmpty, MobileFab, MobileHeader, MobileInput, MobileLoading } from "./MobileUi";

const EXT_ICONS: Record<string, string> = {
  image: "🖼️", pdf: "📕", audio: "🎵", video: "🎬", text: "📝", archive: "🗜️", code: "💻", default: "📄",
};

function iconFor(file: VFile): string {
  if (file.mimeType.startsWith("image/")) return EXT_ICONS.image;
  if (file.mimeType === "application/pdf") return EXT_ICONS.pdf;
  if (file.mimeType.startsWith("audio/")) return EXT_ICONS.audio;
  if (file.mimeType.startsWith("video/")) return EXT_ICONS.video;
  if (isTextFile(file)) return EXT_ICONS.text;
  if (file.mimeType.includes("zip") || file.mimeType.includes("compressed")) return EXT_ICONS.archive;
  if (file.mimeType.startsWith("text/") || file.name.match(/\.(js|ts|jsx|tsx|py|go|rs|java|cpp|c|html|css|json)$/)) return EXT_ICONS.code;
  return EXT_ICONS.default;
}

export default function MobileFiles({ onClose }: { onClose?: () => void }) {
  const [folders, setFolders] = useState<VFolder[]>([]);
  const [files, setFiles] = useState<VFile[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [fRes, allRes] = await Promise.all([
      filesApi.listFolders().catch(() => null),
      query.trim() ? filesApi.all({ q: query.trim() }).catch(() => null) : filesApi.list(folderId).catch(() => null),
    ]);
    if (fRes) setFolders(fRes.folders);
    setFiles(allRes?.files ?? []);
    setLoading(false);
  }, [folderId, query]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    await filesApi.createFolder({ name: newFolder.trim(), parentId: folderId }).catch(() => {});
    setNewFolder("");
    setShowCreate(false);
    void load();
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await filesApi.upload(file, folderId).catch(() => {});
    e.target.value = "";
    void load();
  };

  const toggleStar = async (f: VFile) => {
    await filesApi.toggleStar(f.id).catch(() => {});
    setFiles((list) => list.map((x) => x.id === f.id ? { ...x, starred: !x.starred } : x));
  };

  const remove = async (f: VFile) => {
    if (!window.confirm(`Delete ${f.name}?`)) return;
    await filesApi.delete(f.id).catch(() => {});
    setFiles((list) => list.filter((x) => x.id !== f.id));
  };

  return (
    <MobileContainer>
      <MobileHeader
        title="Files"
        subtitle="Your materials"
        onClose={onClose}
        right={
          <div className="flex items-center gap-2">
            <MobileFab onClick={() => fileRef.current?.click()} icon={<Upload size={20} />} />
            <MobileFab onClick={() => setShowCreate(true)} icon={<Plus size={22} />} />
          </div>
        }
      />

      <input type="file" ref={fileRef} onChange={(e) => void upload(e)} className="hidden" />

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.045] px-3 py-2">
        <Search size={18} className="text-slate-500" />
        <MobileInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files"
          className="border-0 bg-transparent px-2 py-1 text-sm"
        />
      </div>

      {!query.trim() && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-medium ${
              folderId === null ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"
            }`}
          >
            <FolderOpen size={14} /> All
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolderId(f.id)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-medium ${
                folderId === f.id ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"
              }`}
            >
              <Folder size={14} /> {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <MobileLoading />
        ) : files.length ? (
          files.map((f) => (
            <article key={f.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-4">
              <a
                href={filesApi.downloadUrl(f.id)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{iconFor(f)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-white">{f.name}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {formatBytes(f.size)} · {new Date(f.updatedAt).toLocaleDateString()}
                </p>
              </a>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void toggleStar(f)}
                  className={`rounded-xl p-2 ${f.starred ? "text-amber-400" : "text-slate-500"}`}
                >
                  <Star size={18} fill={f.starred ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  className="rounded-xl p-2 text-slate-500 active:text-rose-400"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <MobileEmpty text="No files here. Upload or create a folder." />
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold text-white">New folder</h2>
            <MobileInput value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name" className="mb-4" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400">Cancel</button>
              <button type="button" onClick={() => void createFolder()} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">Create</button>
            </div>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}

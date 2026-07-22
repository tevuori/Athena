import { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder, File as FileIcon, FileText, Image as ImageIcon, Upload, Download,
  Trash2, FolderPlus, ChevronRight, Loader2, X, FileCode,
} from "lucide-react";
import { filesApi, formatBytes, fileIconColor } from "../../services/files";
import type { VFile, VFolder } from "../../types";
import type { WindowInstance } from "../../store/windows";

export default function FilesApp(_: { win: WindowInstance }) {
  const [folders, setFolders] = useState<VFolder[]>([]);
  const [files, setFiles] = useState<VFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Home" },
  ]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<VFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [folderRes, fileRes] = await Promise.all([
        filesApi.listFolders(currentFolder),
        filesApi.list(currentFolder),
      ]);
      setFolders(folderRes.folders);
      setFiles(fileRes.files);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => {
    load();
  }, [load]);

  const navigateTo = (folder: VFolder) => {
    setCurrentFolder(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateBreadcrumb = (index: number) => {
    const target = breadcrumb[index];
    setBreadcrumb(breadcrumb.slice(0, index + 1));
    setCurrentFolder(target.id);
  };

  const createFolder = async () => {
    const name = prompt("Folder name:");
    if (!name) return;
    try {
      const { folder } = await filesApi.createFolder({ name, parentId: currentFolder });
      setFolders((prev) => [...prev, folder]);
    } catch (e) {
      console.error(e);
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const { file: record } = await filesApi.upload(file, currentFolder);
        setFiles((prev) => [...prev, record]);
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const download = async (file: VFile) => {
    try {
      const res = await filesApi.download(file.id);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFile = async (file: VFile) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await filesApi.delete(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (preview?.id === file.id) setPreview(null);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFolder = async (folder: VFolder) => {
    if (!confirm(`Delete folder "${folder.name}" and all its contents?`)) return;
    try {
      await filesApi.deleteFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-full">
      {/* Main panel */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
          <button
            onClick={createFolder}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-ink hover:bg-surface-2"
          >
            <FolderPlus size={13} /> New Folder
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onUpload}
            className="hidden"
          />
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 border-b border-edge px-3 py-1.5 text-xs text-ink-muted">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              <button
                onClick={() => navigateBreadcrumb(i)}
                className={i === breadcrumb.length - 1 ? "text-ink" : "hover:text-ink"}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>

        {/* File grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-ink-muted" />
            </div>
          ) : folders.length + files.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-ink-muted">
              <Folder size={40} className="mb-2 opacity-30" />
              <p className="text-sm">This folder is empty</p>
              <p className="text-xs">Upload files or create a folder</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onDoubleClick={() => navigateTo(folder)}
                  className="group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-3 hover:bg-surface-2"
                >
                  <Folder size={36} className="text-amber-400" />
                  <span className="line-clamp-2 w-full text-center text-xs text-ink">
                    {folder.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder);
                    }}
                    className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-red-500 hover:text-white group-hover:flex"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {files.map((file) => (
                <div
                  key={file.id}
                  onDoubleClick={() => setPreview(file)}
                  className="group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-3 hover:bg-surface-2"
                >
                  <FilePreviewIcon file={file} size={36} />
                  <span className="line-clamp-2 w-full text-center text-xs text-ink">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-ink-muted">{formatBytes(file.size)}</span>
                  <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        download(file);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-surface-3 hover:text-ink"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFile(file);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="flex w-80 shrink-0 flex-col border-l border-edge bg-surface-2">
          <div className="flex items-center justify-between border-b border-edge px-3 py-2">
            <span className="line-clamp-1 text-xs font-medium text-ink">{preview.name}</span>
            <button
              onClick={() => setPreview(null)}
              className="text-ink-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <FilePreview file={preview} />
          <div className="border-t border-edge p-3 text-xs text-ink-muted">
            <div className="flex justify-between py-0.5">
              <span>Type</span>
              <span className="text-ink">{preview.mimeType}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Size</span>
              <span className="text-ink">{formatBytes(preview.size)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Created</span>
              <span className="text-ink">
                {new Date(preview.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => download(preview)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs text-accent-fg"
            >
              <Download size={13} /> Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilePreviewIcon({ file, size }: { file: VFile; size: number }) {
  if (file.mimeType.startsWith("image/")) return <ImageIcon size={size} className="text-green-400" />;
  if (file.mimeType === "application/pdf") return <FileText size={size} className="text-red-400" />;
  if (file.mimeType.startsWith("text/")) return <FileCode size={size} className="text-blue-400" />;
  return <FileIcon size={size} className={fileIconColor(file.mimeType)} />;
}

function FilePreview({ file }: { file: VFile }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (file.mimeType.startsWith("text/")) {
      setLoading(true);
      filesApi
        .download(file.id)
        .then((res: Response) => res.text())
        .then((t: string) => setText(t))
        .catch(() => setText("Failed to load text"))
        .finally(() => setLoading(false));
    } else {
      setText(null);
    }
  }, [file]);

  if (file.mimeType.startsWith("image/")) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-3 p-3">
        <img
          src={filesApi.downloadUrl(file.id)}
          alt={file.name}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    );
  }
  if (file.mimeType === "application/pdf") {
    return (
      <iframe
        src={filesApi.downloadUrl(file.id)}
        className="flex-1 border-0"
        title={file.name}
      />
    );
  }
  if (file.mimeType.startsWith("text/")) {
    return (
      <div className="selectable flex-1 overflow-auto p-3">
        {loading ? (
          <Loader2 size={16} className="animate-spin text-ink-muted" />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs text-ink">{text}</pre>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-ink-muted">
      <FileIcon size={48} className="mb-2 opacity-30" />
      <p className="text-xs">No preview available</p>
    </div>
  );
}

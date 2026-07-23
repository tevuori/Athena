// ===== Shared UI bits for Study Hub modes =====

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="selectable markdown-body prose-sm max-w-none rounded-lg border border-edge bg-surface-2 p-3 text-sm text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export function Loading({ label = "Working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface-2 p-3 text-xs text-ink-muted">
      <Loader2 size={14} className="animate-spin text-accent" /> {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
      <AlertCircle size={14} /> {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-500">
      <CheckCircle2 size={14} /> {message}
    </div>
  );
}

export function ActionButton({
  onClick,
  disabled,
  loading,
  children,
  variant = "primary",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const base =
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40";
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-fg hover:opacity-90"
      : "border border-edge text-ink-muted hover:bg-surface-2 hover:text-ink";
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${styles}`}>
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

export function TruncationNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-500">
      Source was truncated (over 20,000 chars) — results are based on the first part.
    </div>
  );
}

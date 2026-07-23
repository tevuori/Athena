import type { ReactNode } from "react";
import { Loader2, Check } from "lucide-react";

/** Section heading with icon + title + description. */
export function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        {icon}
        {title}
      </h3>
      <p className="mb-4 text-sm text-ink-muted">{description}</p>
    </>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-edge bg-surface-2 p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

export function ToggleRow({
  label,
  description,
  on,
  onClick,
}: {
  label: string;
  description: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-edge bg-surface-2 p-3">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      <button
        onClick={onClick}
        className={`relative h-6 w-11 rounded-full transition ${on ? "bg-accent" : "bg-surface-3"}`}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: on ? "1.375rem" : "0.125rem" }}
        />
      </button>
    </div>
  );
}

export function StatusPill({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        on ? "bg-emerald-500/15 text-emerald-500" : "bg-surface-3 text-ink-muted"
      }`}
    >
      {on ? <Check size={12} /> : null}
      {on ? onLabel : offLabel}
    </span>
  );
}

export function SaveButton({
  busy,
  disabled,
  onClick,
  children = "Save",
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      {children}
    </button>
  );
}

export function MsgBox({ msg, error }: { msg: string | null; error?: boolean }) {
  if (!msg) return null;
  return <p className={`mt-2 text-xs ${error ? "text-red-500" : "text-ink-muted"}`}>{msg}</p>;
}

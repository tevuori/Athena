import { ArrowLeft, Plus, X } from "lucide-react";
import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function MobileContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-md px-5 pb-7 pt-[max(1.5rem,env(safe-area-inset-top))] ${className}`}>{children}</div>;
}

export function MobileHeader({
  title,
  subtitle,
  onBack,
  onClose,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[.06] text-white active:bg-white/[.1]"
          >
            <X size={21} />
          </button>
        )}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[.06] text-white active:bg-white/[.1]"
          >
            <ArrowLeft size={21} />
          </button>
        )}
        <div className="min-w-0">
          {subtitle && <p className="text-sm font-medium text-indigo-300">{subtitle}</p>}
          <h1 className="text-3xl font-bold text-white">{title}</h1>
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

export function MobileFab({ onClick, icon }: { onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/40 active:scale-[.98]"
    >
      {icon ?? <Plus size={22} />}
    </button>
  );
}

export function MobileEmpty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-white/15 px-4 py-5 text-sm leading-6 text-slate-400">{text}</p>;
}

export function MobileLoading({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[.06]" />
      ))}
    </div>
  );
}

export function MobileInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/50 ${props.className ?? ""}`}
    />
  );
}

export function MobileTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-none rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/50 ${props.className ?? ""}`}
    />
  );
}

export function MobileSelect(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 text-base text-white outline-none focus:border-indigo-400/50 ${props.className ?? ""}`}
    >
      {props.children}
    </select>
  );
}

export function MobileSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  getLabel: (value: T) => string;
}) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
            value === option ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-300"
          }`}
        >
          {getLabel(option)}
        </button>
      ))}
    </div>
  );
}

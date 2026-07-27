// ===== Lightweight pure-SVG chart components for the Analytics dashboard =====
// No external charting dependency. All charts are responsive (viewBox + width
// 100%) and themed via Tailwind text colors / CSS vars (currentColor).

import { useMemo } from "react";

// ---------------------------------------------------------------------------
// BarChart — vertical bars from a numeric series. Optional unit + tooltip.
// ---------------------------------------------------------------------------

export function BarChart({
  data,
  color = "rgb(var(--accent))",
  height = 120,
  unit = "",
  formatValue,
}: {
  data: { day: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 100;
  const H = 100;
  const barW = W / Math.max(1, data.length);
  const fmt = formatValue ?? ((v: number) => `${v}${unit}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * H;
        const x = i * barW;
        return (
          <rect
            key={i}
            x={x + barW * 0.15}
            y={H - h}
            width={barW * 0.7}
            height={h}
            rx={Math.min(1, barW * 0.35)}
            fill={color}
            opacity={d.value === 0 ? 0.12 : 0.85}
          >
            <title>{`${d.day}: ${fmt(d.value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LineChart — line + area fill. Supports an optional second "rate" series
// (0–1) drawn as a dashed line on a 0–100% scale (used for retention).
// ---------------------------------------------------------------------------

export function LineChart({
  data,
  color = "rgb(var(--accent))",
  height = 120,
  unit = "",
  formatValue,
}: {
  data: { day: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
  formatValue?: (v: number) => string;
}) {
  const W = 100;
  const H = 100;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * W : W / 2;
    const y = H - (d.value / max) * H;
    return { x, y, d };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const fmt = formatValue ?? ((v: number) => `${v}${unit}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <defs>
        <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lc-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.1} fill={color} vectorEffect="non-scaling-stroke">
          <title>{`${p.d.day}: ${fmt(p.d.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RateLineChart — for 0–1 rate series (e.g. retention / adherence). Draws
// only points that exist (skips nulls) and a faint baseline at 0.5.
// ---------------------------------------------------------------------------

export function RateLineChart({
  data,
  color = "rgb(var(--accent))",
  height = 120,
  formatValue,
}: {
  data: { day: string; rate: number | null }[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const W = 100;
  const H = 100;
  const fmt = formatValue ?? ((v: number) => `${Math.round(v * 100)}%`);
  const present = data.map((d, i) => ({ ...d, i })).filter((d) => d.rate !== null);
  const segs: string[] = [];
  present.forEach((p, idx) => {
    const x = data.length > 1 ? (p.i / (data.length - 1)) * W : W / 2;
    const y = H - (p.rate as number) * H;
    segs.push(`${idx === 0 || present[idx - 1].i !== p.i - 1 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgb(var(--edge))" strokeWidth={0.5} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      {segs.length > 0 && <path d={segs.join(" ")} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
      {present.map((p) => {
        const x = data.length > 1 ? (p.i / (data.length - 1)) * W : W / 2;
        const y = H - (p.rate as number) * H;
        return (
          <circle key={p.i} cx={x} cy={y} r={1.2} fill={color} vectorEffect="non-scaling-stroke">
            <title>{`${p.day}: ${fmt(p.rate as number)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// DonutChart — segments with a center label.
// ---------------------------------------------------------------------------

export function DonutChart({
  segments,
  size = 140,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 40;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={12} />
      {total > 0 &&
        segments.map((s, i) => {
          const frac = s.value / total;
          const len = frac * circ;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={12}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      {centerLabel && (
        <text x={cx} y={cy - 1} textAnchor="middle" dominantBaseline="middle" className="fill-ink" style={{ fontSize: 14, fontWeight: 700 }}>
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle" className="fill-ink-muted" style={{ fontSize: 6 }}>
          {centerSub}
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Heatmap — GitHub-style grid for habit adherence (last N days).
// ---------------------------------------------------------------------------

export function Heatmap({
  days,
  rates,
  color = "rgb(var(--accent))",
}: {
  days: string[];
  rates: number[]; // 0–1 per day
  color?: string;
}) {
  const cells = useMemo(() => {
    return days.map((day, i) => ({ day, rate: rates[i] ?? 0 }));
  }, [days, rates]);
  // Group into weeks (columns of 7), oldest first.
  const weeks: { day: string; rate: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div className="flex gap-0.5 overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-0.5">
          {week.map((cell, ci) => {
            const op = cell.rate === 0 ? 0.08 : 0.25 + cell.rate * 0.75;
            return (
              <div
                key={ci}
                className="h-3 w-3 rounded-sm"
                style={{ background: color, opacity: op }}
                title={`${cell.day}: ${Math.round(cell.rate * 100)}%`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LevelRing — circular progress ring showing level + XP progress.
// ---------------------------------------------------------------------------

export function LevelRing({
  level,
  progress,
  size = 120,
  color = "rgb(var(--accent))",
}: {
  level: number;
  progress: number; // 0–1
  size?: number;
  color?: string;
}) {
  const r = 42;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, progress));
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={8} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" className="fill-ink-muted" style={{ fontSize: 7, fontWeight: 600, letterSpacing: 0.5 }}>
        LEVEL
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle" className="fill-ink" style={{ fontSize: 20, fontWeight: 800 }}>
        {level}
      </text>
    </svg>
  );
}

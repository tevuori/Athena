// ===== Elevation profile (inline SVG) =====
// A small pure-SVG elevation chart for a hike day's geometry. The elevation
// is sampled server-side (mapy.com /elevation) and returned as ascent/descent
// totals; here we render a simple filled area chart from an array of
// [distanceM, elevationM] samples. When no per-point elevation is available
// (e.g. a fallback route), we render a flat baseline with the ascent/descent
// totals as text.

interface ElevationPoint {
  /** Cumulative distance from the start, in meters. */
  distM: number;
  /** Elevation in meters at that point. */
  elevM: number;
}

interface Props {
  points?: ElevationPoint[];
  /** Fallback totals when no per-point elevation is available. */
  ascentM?: number;
  descentM?: number;
  /** Total route distance in meters (for the x-axis label). */
  totalDistanceM?: number;
  className?: string;
}

const WIDTH = 280;
const HEIGHT = 64;
const PAD = 4;

export default function ElevationProfile({
  points,
  ascentM,
  descentM,
  totalDistanceM,
  className,
}: Props) {
  // No per-point elevation → render a flat baseline + totals.
  if (!points || points.length < 2) {
    return (
      <div className={className}>
        <svg width={WIDTH} height={HEIGHT} className="block">
          <line
            x1={PAD}
            y1={HEIGHT / 2}
            x2={WIDTH - PAD}
            y2={HEIGHT / 2}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            className="text-ink-muted"
            opacity={0.4}
          />
        </svg>
        <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
          <span>↑ {Math.round(ascentM ?? 0)} m</span>
          <span>↓ {Math.round(descentM ?? 0)} m</span>
        </div>
      </div>
    );
  }

  const elevs = points.map((p) => p.elevM);
  const minE = Math.min(...elevs);
  const maxE = Math.max(...elevs);
  const span = Math.max(maxE - minE, 1);
  const maxDist = Math.max(points[points.length - 1].distM, 1);

  const x = (d: number) => PAD + (d / maxDist) * (WIDTH - 2 * PAD);
  const y = (e: number) => HEIGHT - PAD - ((e - minE) / span) * (HEIGHT - 2 * PAD);

  const pathParts = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.distM).toFixed(1)} ${y(p.elevM).toFixed(1)}`);
  const linePath = pathParts.join(" ");
  const areaPath = `${linePath} L ${x(maxDist).toFixed(1)} ${HEIGHT - PAD} L ${x(0).toFixed(1)} ${HEIGHT - PAD} Z`;

  return (
    <div className={className}>
      <svg width={WIDTH} height={HEIGHT} className="block">
        <path d={areaPath} className="fill-accent" opacity={0.18} />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-accent"
        />
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
        <span>{Math.round(minE)} m</span>
        <span>↑ {Math.round(ascentM ?? 0)} / ↓ {Math.round(descentM ?? 0)} m</span>
        <span>{Math.round(maxE)} m</span>
      </div>
      {totalDistanceM !== undefined && (
        <div className="text-[10px] text-ink-muted">{(totalDistanceM / 1000).toFixed(1)} km</div>
      )}
    </div>
  );
}

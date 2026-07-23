import { Volume2, Sparkles, Music } from "lucide-react";
import { useSettings, type AthenaRollEdge } from "../../../store/settings";
import { SectionHeader, Card, Field, inputClass, ToggleRow } from "../ui";

const EDGES: { id: AthenaRollEdge; label: string }[] = [
  { id: "bottom", label: "Bottom" },
  { id: "top", label: "Top" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

export default function SoundAthenaSection() {
  const {
    volume,
    setVolume,
    athenaRollEdge,
    setAthenaRollEdge,
    athenaQuickSize,
    setAthenaQuickSize,
    autoChillOnIdle,
    setAutoChillOnIdle,
  } = useSettings();

  const size = athenaQuickSize ?? { width: 420, height: 560 };

  return (
    <section id="sound-athena" className="mb-8">
      <SectionHeader
        icon={<Volume2 size={18} />}
        title="Sound & Athena Panel"
        description="System volume and the Athena quick-assistant panel behavior."
      />

      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Volume2 size={18} className="text-ink-muted" />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="w-10 text-right text-sm tabular-nums text-ink-muted">{volume}</span>
        </div>
      </Card>

      <Card>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles size={15} /> Quick panel
        </h4>
        <p className="mb-3 text-xs text-ink-muted">
          The Athena quick panel rolls in from the selected screen edge (Win+Y).
        </p>
        <div className="mb-4">
          <span className="mb-2 block text-[11px] uppercase tracking-wide text-ink-muted">Roll-in edge</span>
          <div className="flex flex-wrap gap-2">
            {EDGES.map((e) => (
              <button
                key={e.id}
                onClick={() => setAthenaRollEdge(e.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  athenaRollEdge === e.id
                    ? "border-accent bg-accent/10 text-ink"
                    : "border-edge text-ink-muted hover:bg-surface-3"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Panel width (px)">
            <input
              type="number"
              min={280}
              max={900}
              value={size.width}
              onChange={(e) => setAthenaQuickSize({ ...size, width: Number(e.target.value) })}
              className={inputClass}
            />
          </Field>
          <Field label="Panel height (px)">
            <input
              type="number"
              min={300}
              max={1200}
              value={size.height}
              onChange={(e) => setAthenaQuickSize({ ...size, height: Number(e.target.value) })}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card className="mt-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Music size={15} /> Auto chill mode
        </h4>
        <ToggleRow
          label="Enter fullscreen when idle"
          description="When Spotify music is playing and you've been inactive for over 10 minutes, automatically enter the fullscreen chill view. Move the mouse or press a key to exit."
          on={autoChillOnIdle}
          onClick={() => setAutoChillOnIdle(!autoChillOnIdle)}
        />
      </Card>
    </section>
  );
}

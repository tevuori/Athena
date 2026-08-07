import { useState } from "react";
import { FlaskConical, Lock, Loader2, Sparkles } from "lucide-react";
import { useFeatures } from "../../../store/features";
import { APPS } from "../../../apps/registry";
import { SectionHeader, Card, StatusPill } from "../ui";

/** Beta apps — gated behind the per-user toggle. Mirrors the registry tier. */
const BETA_APP_NAMES = APPS.filter((a) => a.tier === "beta").map((a) => a.name);

export default function BetaSection() {
  const betaEnabled = useFeatures((s) => s.betaEnabled);
  const vutGranted = useFeatures((s) => s.vutGranted);
  const setBeta = useFeatures((s) => s.setBeta);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      await setBeta(!betaEnabled);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="beta" className="mb-8">
      <SectionHeader
        icon={<FlaskConical size={18} />}
        title="Beta & Experimental Apps"
        description="Unlock additional apps that are still being refined. Core apps (Notes, Tasks, Files, Whiteboard, Study Hub, Mavino, Today) are always available."
      />

      <Card className="mb-3 flex items-center justify-between p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Enable beta apps</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Shows experimental apps in your taskbar, start menu, and command palette. You can turn this off anytime — your data in those apps is preserved.
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              <span className="font-medium text-ink">Unlocks:</span> {BETA_APP_NAMES.join(", ")}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            betaEnabled ? "bg-accent" : "bg-surface-3"
          } disabled:opacity-50`}
          role="switch"
          aria-checked={betaEnabled}
        >
          {busy ? (
            <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
          ) : (
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                betaEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          )}
        </button>
      </Card>

      <Card className="flex items-center justify-between p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-muted">
            <Lock size={16} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">VUT &amp; Moodle integration</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              VUT Studis + Moodle access is granted per user by an administrator. It is not part of the beta toggle.
            </p>
          </div>
        </div>
        <StatusPill
          on={vutGranted}
          onLabel="Granted"
          offLabel="Not enabled"
        />
      </Card>

      {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
    </section>
  );
}

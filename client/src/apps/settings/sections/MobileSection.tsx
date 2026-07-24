import { Smartphone, Monitor, Tablet } from "lucide-react";
import { useFormFactor, type FormFactorOverride } from "../../../store/formfactor";
import { SectionHeader, Card } from "../ui";

const OPTIONS: { value: FormFactorOverride; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "auto", label: "Automatic", icon: <Smartphone size={16} />, desc: "Detect from device (recommended)" },
  { value: "phone", label: "Phone", icon: <Smartphone size={16} />, desc: "Force the mobile shell with bottom nav" },
  { value: "tablet", label: "Tablet", icon: <Tablet size={16} />, desc: "Force the desktop shell (touch tweaks)" },
  { value: "desktop", label: "Desktop", icon: <Monitor size={16} />, desc: "Force the desktop shell" },
];

export default function MobileSection() {
  const { override, detected, setOverride } = useFormFactor();

  return (
    <section id="mobile" className="mb-8">
      <SectionHeader
        icon={<Smartphone size={18} />}
        title="Mobile"
        description="Choose how Athena adapts to this device. The mobile shell is optimized for phones."
      />

      <Card>
        <h4 className="mb-1 text-sm font-semibold text-ink">Form factor</h4>
        <p className="mb-3 text-xs text-ink-muted">
          Detected: <span className="font-medium text-ink">{detected}</span>. Override to force a
          specific shell regardless of the device.
        </p>
        <div className="grid grid-cols-1 gap-2 @3xl:grid-cols-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOverride(opt.value)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                override === opt.value
                  ? "border-accent bg-accent/10"
                  : "border-edge hover:bg-surface-3"
              }`}
            >
              <span className={`mt-0.5 ${override === opt.value ? "text-accent" : "text-ink-muted"}`}>
                {opt.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{opt.label}</p>
                <p className="text-xs text-ink-muted">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Changes apply immediately. On a phone, selecting "Desktop" gives you the full window
          manager (best on a large screen).
        </p>
      </Card>
    </section>
  );
}

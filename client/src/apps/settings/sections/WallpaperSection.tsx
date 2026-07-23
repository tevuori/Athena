import { Image } from "lucide-react";
import { useSettings, type WallpaperId } from "../../../store/settings";
import { SectionHeader } from "../ui";

const WALLPAPERS: { id: WallpaperId; name: string; preview: string }[] = [
  { id: "aurora", name: "Aurora", preview: "linear-gradient(135deg, #4f46e5, #9333ea, #06b6d4)" },
  { id: "sunset", name: "Sunset", preview: "linear-gradient(135deg, #f97316, #ec4899)" },
  { id: "ocean", name: "Ocean", preview: "linear-gradient(135deg, #0ea5e9, #14b8a6)" },
  { id: "forest", name: "Forest", preview: "linear-gradient(135deg, #22c55e, #15803d)" },
  { id: "mesh", name: "Mesh", preview: "linear-gradient(135deg, #1e293b, #475569)" },
  { id: "mono", name: "Mono", preview: "linear-gradient(135deg, #0f172a, #1e293b)" },
];

export default function WallpaperSection() {
  const { wallpaper, setWallpaper } = useSettings();
  return (
    <section id="wallpaper" className="mb-8">
      <SectionHeader icon={<Image size={18} />} title="Wallpaper" description="Choose your desktop background." />
      <div className="grid grid-cols-3 gap-3">
        {WALLPAPERS.map((w) => (
          <button
            key={w.id}
            onClick={() => setWallpaper(w.id)}
            className={`group overflow-hidden rounded-lg border-2 transition ${
              wallpaper === w.id ? "border-accent" : "border-edge hover:border-ink-muted"
            }`}
          >
            <div className="h-20 w-full" style={{ background: w.preview }} />
            <div className="bg-surface-2 py-1.5 text-center text-xs text-ink">{w.name}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

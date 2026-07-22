import { useSettings, type ThemeMode, type WallpaperId } from "../../store/settings";
import { useAuth } from "../../store/auth";
import { Sun, Moon, Palette, Image, Bell, User } from "lucide-react";
import type { WindowInstance } from "../../store/windows";

const ACCENT_PRESETS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6",
];

const WALLPAPERS: { id: WallpaperId; name: string; preview: string }[] = [
  { id: "aurora", name: "Aurora", preview: "linear-gradient(135deg, #4f46e5, #9333ea, #06b6d4)" },
  { id: "sunset", name: "Sunset", preview: "linear-gradient(135deg, #f97316, #ec4899)" },
  { id: "ocean", name: "Ocean", preview: "linear-gradient(135deg, #0ea5e9, #14b8a6)" },
  { id: "forest", name: "Forest", preview: "linear-gradient(135deg, #22c55e, #15803d)" },
  { id: "mesh", name: "Mesh", preview: "linear-gradient(135deg, #1e293b, #475569)" },
  { id: "mono", name: "Mono", preview: "linear-gradient(135deg, #0f172a, #1e293b)" },
];

export default function SettingsApp(_: { win: WindowInstance }) {
  const {
    theme, setTheme,
    accent, setAccent,
    wallpaper, setWallpaper,
    notificationsEnabled, setNotificationsEnabled,
    doNotDisturb, setDoNotDisturb,
  } = useSettings();
  const { user } = useAuth();

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-edge bg-surface-2 p-3">
        <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Settings
        </h2>
        <nav className="space-y-1 text-sm">
          {[
            { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
            { id: "wallpaper", label: "Wallpaper", icon: <Image size={15} /> },
            { id: "account", label: "Account", icon: <User size={15} /> },
            { id: "notifications", label: "Notifications", icon: <Bell size={15} /> },
          ].map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-ink hover:bg-surface-3"
            >
              {s.icon}
              <span>{s.label}</span>
            </a>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Appearance */}
        <section id="appearance" className="mb-8">
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <Palette size={18} /> Appearance
          </h3>
          <p className="mb-4 text-sm text-ink-muted">Customize how Athena looks.</p>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-ink">Theme</label>
            <div className="flex gap-2">
              {(["light", "dark"] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm capitalize transition ${
                    theme === t
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-edge text-ink-muted hover:bg-surface-2"
                  }`}
                >
                  {t === "dark" ? <Moon size={15} /> : <Sun size={15} />}
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Accent color</label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAccent(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    accent === c ? "border-ink ring-2 ring-accent" : "border-transparent"
                  }`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border border-edge bg-transparent"
                title="Custom color"
              />
            </div>
          </div>
        </section>

        {/* Wallpaper */}
        <section id="wallpaper" className="mb-8">
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <Image size={18} /> Wallpaper
          </h3>
          <p className="mb-4 text-sm text-ink-muted">Choose your desktop background.</p>
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

        {/* Account */}
        <section id="account" className="mb-8">
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <User size={18} /> Account
          </h3>
          <p className="mb-4 text-sm text-ink-muted">Your profile information.</p>
          <div className="flex items-center gap-4 rounded-lg border border-edge bg-surface-2 p-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white"
              style={{ background: user?.avatarColor ?? "#6366f1" }}
            >
              {(user?.displayName || user?.username || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-ink">{user?.displayName || "—"}</p>
              <p className="text-sm text-ink-muted">@{user?.username}</p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section id="notifications" className="mb-8">
          <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
            <Bell size={18} /> Notifications
          </h3>
          <p className="mb-4 text-sm text-ink-muted">Control notification behavior.</p>
          <div className="space-y-3">
            <ToggleRow
              label="Enable notifications"
              description="Show notifications from apps"
              on={notificationsEnabled}
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            />
            <ToggleRow
              label="Do not disturb"
              description="Silence all notifications (also mutes during Pomodoro focus)"
              on={doNotDisturb}
              onClick={() => setDoNotDisturb(!doNotDisturb)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ToggleRow({
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

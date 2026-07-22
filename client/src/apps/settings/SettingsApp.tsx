import { useState, useEffect, useCallback } from "react";
import { useSettings, type ThemeMode, type WallpaperId } from "../../store/settings";
import { useAuth } from "../../store/auth";
import { aiApi, type AiKeyStatus } from "../../services/ai";
import { Sun, Moon, Palette, Image, Bell, User, Sparkles, Loader2, Check, Trash2 } from "lucide-react";
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
            { id: "ai", label: "AI", icon: <Sparkles size={15} /> },
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

        {/* AI */}
        <AiSection />

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

function AiSection() {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await aiApi.getKeyStatus();
      setStatus(s);
      setProvider(s.provider || "openai");
      setBaseUrl(s.baseUrl || "");
      setModelId(s.modelId || "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!keyInput.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await aiApi.setKey(
        keyInput.trim(),
        provider.trim() || undefined,
        baseUrl.trim() || undefined,
        modelId.trim() || undefined
      );
      setKeyInput("");
      await refresh();
      setMsg("AI configuration saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove your stored AI API key?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await aiApi.deleteKey();
      await refresh();
      setMsg("API key removed.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to remove key");
    } finally {
      setBusy(false);
    }
  };

  const hasKey = status?.hasKey ?? false;

  return (
    <section id="ai" className="mb-8">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Sparkles size={18} /> AI
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        Connect an LLM provider to power Athena — your workspace assistant.
        Defaults to OpenCode Zen (DeepSeek V4 Flash Free). Any multi-llm-ts
        provider works (openai, deepseek, anthropic, openrouter, ollama, …).
      </p>
      <div className="rounded-lg border border-edge bg-surface-2 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
              hasKey ? "bg-emerald-500/15 text-emerald-500" : "bg-surface-3 text-ink-muted"
            }`}
          >
            {hasKey ? <Check size={12} /> : <Sparkles size={12} />}
            {hasKey ? "Key set" : "No key set"}
          </span>
          {status?.configured && !hasKey && (
            <span className="text-xs text-ink-muted">(server fallback key active)</span>
          )}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="openai">openai (OpenAI-compatible)</option>
              <option value="deepseek">deepseek</option>
              <option value="anthropic">anthropic</option>
              <option value="openrouter">openrouter</option>
              <option value="groq">groq</option>
              <option value="mistralai">mistralai</option>
              <option value="google">google</option>
              <option value="ollama">ollama (local)</option>
              <option value="xai">xai</option>
              <option value="meta">meta</option>
              <option value="cerebras">cerebras</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">Model id (optional)</span>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="deepseek-v4-flash-free"
              className="rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">
            Base URL (optional — for OpenAI-compatible endpoints like OpenCode Zen)
          </span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://opencode.ai/zen/v1"
            className="rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="API key"
            className="flex-1 rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <button
            onClick={save}
            disabled={busy || !keyInput.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save
          </button>
          {hasKey && (
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-red-500 hover:text-white disabled:opacity-40"
              title="Remove key"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        {msg && <p className="mt-2 text-xs text-ink-muted">{msg}</p>}
        <p className="mt-3 text-xs text-ink-muted">
          The key is encrypted (AES-256-GCM) and stored only on the server.
        </p>
      </div>
    </section>
  );
}

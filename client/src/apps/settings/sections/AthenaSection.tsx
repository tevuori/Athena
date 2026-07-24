import { useState, useEffect, useCallback } from "react";
import { Sparkles, Trash2, Loader2, Check, Gauge, Shield } from "lucide-react";
import { aiApi, type AiKeyStatus } from "../../../services/ai";
import { getAthenaInstructions, setAthenaInstructions } from "../../../services/athena";
import { SectionHeader, Card, Field, StatusPill, SaveButton, MsgBox, inputClass } from "../ui";

export default function AthenaSection() {
  return (
    <section id="athena" className="mb-8">
      <SectionHeader
        icon={<Sparkles size={18} />}
        title="Athena Assistant"
        description="Connect an LLM provider and customize how Athena responds."
      />
      <LlmConfigCard />
      <RateLimitCard />
      <FallbackCard />
      <InstructionsCard />
    </section>
  );
}

function LlmConfigCard() {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

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
    setErr(false);
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
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove your stored AI API key?")) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await aiApi.deleteKey();
      await refresh();
      setMsg("API key removed.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to remove key");
    } finally {
      setBusy(false);
    }
  };

  const hasKey = status?.hasKey ?? false;

  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <StatusPill on={hasKey} onLabel="Key set" offLabel="No key set" />
        {!hasKey && (
          <span className="text-xs text-ink-muted">Athena AI requires a key to function</span>
        )}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={inputClass}
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
        </Field>
        <Field label="Model id (optional)">
          <input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="e.g. gpt-4o-mini, deepseek-chat"
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="Base URL (optional — for OpenAI-compatible endpoints)"
      >
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className={inputClass}
        />
      </Field>
      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="API key"
          className={`flex-1 ${inputClass}`}
        />
        <SaveButton busy={busy} onClick={save} disabled={!keyInput.trim()}>
          Save
        </SaveButton>
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
      <MsgBox msg={msg} error={err} />
      <p className="mt-3 text-xs text-ink-muted">
        The key is encrypted (AES-256-GCM) and stored only on the server. Without a key,
        Athena's chat and AI features are unavailable.
      </p>
    </Card>
  );
}

function RateLimitCard() {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [rpd, setRpd] = useState(50);
  const [rpm, setRpm] = useState(20);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await aiApi.getKeyStatus();
      setStatus(s);
      setEnabled(s.rateLimitEnabled);
      setRpd(s.rateLimitRpd);
      setRpm(s.rateLimitRpm);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await aiApi.setRateLimit({ rateLimitEnabled: enabled, rateLimitRpd: rpd, rateLimitRpm: rpm });
      await refresh();
      setMsg("Rate limit settings saved.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const hasKey = status?.hasKey ?? false;
  const usage = status?.rateLimitUsage;

  return (
    <Card className="mb-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Gauge size={14} /> Rate limit protection
      </h4>
      <p className="mb-3 text-xs text-ink-muted">
        Prevent requests from exceeding your LLM provider's free-tier rate limits. When enabled,
        requests that would exceed the limit are blocked (or routed to your fallback model if configured).
        Defaults match OpenRouter's free model limits.
      </p>
      {!hasKey ? (
        <p className="text-xs text-ink-muted">Set an API key first to configure rate limits.</p>
      ) : (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4 accent-accent"
            />
            Enable rate limit protection
          </label>
          {enabled && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Field label="Requests per day (RPD)">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={rpd}
                  onChange={(e) => setRpd(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Requests per minute (RPM)">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={rpm}
                  onChange={(e) => setRpm(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
            </div>
          )}
          {enabled && usage && (
            <div className="mb-3 flex gap-4 text-xs text-ink-muted">
              <span>Today: <strong className="text-ink">{usage.dayCount}</strong> / {rpd}</span>
              <span>This minute: <strong className="text-ink">{usage.minuteCount}</strong> / {rpm}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <SaveButton busy={busy} onClick={save} disabled={!hasKey}>
              Save
            </SaveButton>
          </div>
          <MsgBox msg={msg} error={err} />
        </>
      )}
    </Card>
  );
}

function FallbackCard() {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await aiApi.getKeyStatus();
      setStatus(s);
      setProvider(s.fallbackProvider || "openai");
      setBaseUrl(s.fallbackBaseUrl || "");
      setModelId(s.fallbackModelId || "");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await aiApi.setFallback({
        fallbackApiKey: keyInput.trim() || undefined,
        fallbackProvider: provider.trim() || undefined,
        fallbackBaseUrl: baseUrl.trim() || undefined,
        fallbackModelId: modelId.trim() || undefined,
      });
      setKeyInput("");
      await refresh();
      setMsg("Fallback LLM saved.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const hasKey = status?.hasKey ?? false;
  const hasFallback = status?.hasFallback ?? false;

  return (
    <Card className="mb-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Shield size={14} /> Fallback LLM
      </h4>
      <p className="mb-3 text-xs text-ink-muted">
        Secondary LLM used when the primary model hits rate limits. Leave the API key blank to clear
        the fallback. The fallback is used automatically when rate limit protection is enabled.
      </p>
      {!hasKey ? (
        <p className="text-xs text-ink-muted">Set a primary API key first.</p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <StatusPill on={hasFallback} onLabel="Fallback set" offLabel="No fallback" />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Field label="Fallback provider">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={inputClass}
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
            </Field>
            <Field label="Fallback model id (optional)">
              <input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. gpt-4o-mini, deepseek-chat"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Fallback base URL (optional)">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className={inputClass}
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasFallback ? "New fallback API key (leave blank to keep)" : "Fallback API key"}
              className={`flex-1 ${inputClass}`}
            />
            <SaveButton busy={busy} onClick={save} disabled={!hasKey}>
              Save
            </SaveButton>
          </div>
          <MsgBox msg={msg} error={err} />
        </>
      )}
    </Card>
  );
}

function InstructionsCard() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAthenaInstructions()
      .then((t) => {
        setText(t);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await setAthenaInstructions(text);
      setMsg("Instructions saved.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
        <Check size={14} /> Custom instructions
      </h4>
      <p className="mb-3 text-xs text-ink-muted">
        Tell Athena how to behave — tone, language, formatting preferences, things to always
        remember. Injected into every chat turn.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!loaded}
        rows={5}
        placeholder="e.g. Always answer in Spanish. Be concise. I'm studying computer science at VUT."
        className={`mb-3 w-full resize-y rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent ${inputClass}`}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-muted">{text.length}/4000</span>
        <SaveButton busy={busy} onClick={save} disabled={!loaded || text.length > 4000}>
          Save instructions
        </SaveButton>
      </div>
      <MsgBox msg={msg} error={err} />
    </Card>
  );
}

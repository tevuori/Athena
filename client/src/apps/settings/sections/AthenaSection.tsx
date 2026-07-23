import { useState, useEffect, useCallback } from "react";
import { Sparkles, Trash2, Loader2, Check } from "lucide-react";
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
        {status?.configured && !hasKey && (
          <span className="text-xs text-ink-muted">(server fallback key active)</span>
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
            placeholder="deepseek-v4-flash-free"
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="Base URL (optional — for OpenAI-compatible endpoints like OpenCode Zen)"
      >
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://opencode.ai/zen/v1"
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
        The key is encrypted (AES-256-GCM) and stored only on the server. Defaults to OpenCode Zen
        (DeepSeek V4 Flash Free) when no key is set.
      </p>
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

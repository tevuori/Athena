import { useState, useEffect, useCallback } from "react";
import { Plug, Music, GraduationCap, Calendar, BookOpen, Loader2, LogOut, RefreshCw, ExternalLink, Bell } from "lucide-react";
import { spotifyApi, type SpotifyCredentialStatus } from "../../../services/spotify";
import { vutApi } from "../../../services/vut";
import { microsoftApi, type MicrosoftCredentialStatus } from "../../../services/microsoft";
import { moodleApi } from "../../../services/moodle";
import { ntfyApi } from "../../../services/ntfy";
import { useWindows } from "../../../store/windows";
import { SectionHeader, Card, Field, StatusPill, SaveButton, MsgBox, inputClass } from "../ui";

export default function IntegrationsSection() {
  return (
    <section id="integrations" className="mb-8">
      <SectionHeader
        icon={<Plug size={18} />}
        title="Integrations"
        description="Connect external services with your own credentials. Each user configures these independently."
      />
      <SpotifyCard />
      <VutCard />
      <MicrosoftCard />
      <MoodleCard />
      <NtfyCard />
    </section>
  );
}

function NtfyCard() {
  const [status, setStatus] = useState<{ configured: boolean; enabled: boolean } | null>(null);
  const openWindow = useWindows((s) => s.open);

  const refresh = useCallback(async () => {
    try {
      const s = await ntfyApi.getStatus();
      setStatus({ configured: s.configured, enabled: s.enabled });
    } catch {
      setStatus({ configured: false, enabled: false });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <Card className="mt-3">
      <IntegrationRow
        icon={<Bell size={18} />}
        name="Ntfy"
        description="Bidirectional push channel — Athena notifies your phone and you can message Athena from anywhere. Manage cron jobs in the Ntfy app."
        pill={
          <StatusPill
            on={!!status?.configured}
            onLabel={status?.enabled ? "Connected" : "Disabled"}
            offLabel="Not configured"
          />
        }
        action={
          <button
            onClick={() => openWindow({ appId: "ntfy", title: "Ntfy", icon: "Bell" })}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-ink hover:bg-surface-3"
          >
            <ExternalLink size={12} /> Open Ntfy
          </button>
        }
      />
    </Card>
  );
}

function SpotifyCard() {
  const [status, setStatus] = useState<SpotifyCredentialStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await spotifyApi.getCredentials();
      setStatus(s);
    } catch {
      setStatus({ hasCredentials: false, configured: false, usingEnvFallback: false });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await spotifyApi.setCredentials(clientId.trim(), clientSecret.trim(), refreshToken.trim());
      setClientId(""); setClientSecret(""); setRefreshToken("");
      await refresh();
      setMsg("Spotify credentials saved.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to save credentials");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Remove your stored Spotify credentials?")) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await spotifyApi.deleteCredentials();
      await refresh();
      setMsg("Spotify credentials removed.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const hasCreds = status?.hasCredentials ?? false;
  const configured = status?.configured ?? false;

  return (
    <Card className="mb-3">
      <IntegrationRow
        icon={<Music size={18} />}
        name="Spotify"
        description="Powers the Music Widget & Chill mode. Connect your own Spotify account."
        pill={
          <StatusPill
            on={configured}
            onLabel={hasCreds ? "Connected" : status?.usingEnvFallback ? "Server fallback" : "Connected"}
            offLabel="Not configured"
          />
        }
      />
      {hasCreds ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-red-500 hover:text-white disabled:opacity-40"
          >
            <LogOut size={14} /> Disconnect
          </button>
          {busy && <Loader2 size={14} className="animate-spin text-ink-muted" />}
          {status?.usingEnvFallback === false && hasCreds && (
            <span className="text-xs text-ink-muted">Using your credentials</span>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Client ID">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Spotify app Client ID"
                className={inputClass}
              />
            </Field>
            <Field label="Client Secret">
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Spotify app Client Secret"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Refresh Token">
            <input
              type="password"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="Spotify OAuth refresh token"
              className={inputClass}
            />
          </Field>
          <div className="flex items-center gap-2">
            <SaveButton busy={busy} onClick={connect} disabled={!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()}>
              Connect
            </SaveButton>
            {status?.usingEnvFallback && (
              <span className="text-xs text-ink-muted">Server fallback active — add your own to override</span>
            )}
          </div>
        </div>
      )}
      <MsgBox msg={msg} error={err} />
      <p className="mt-2 text-xs text-ink-muted">
        Create a Spotify app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="underline">developer.spotify.com</a>,
        use the Authorization Code flow with <code className="text-ink">offline_access</code> scope to get a refresh token.
        Credentials are encrypted (AES-256-GCM) and stored only on the server.
      </p>
    </Card>
  );
}

function VutCard() {
  const [status, setStatus] = useState<{ configured: boolean; username?: string; authenticated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await vutApi.status();
      setStatus(s);
      setU(s.username ?? "");
    } catch {
      setStatus({ configured: false, authenticated: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    if (!u.trim() || !p) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await vutApi.login(u.trim(), p);
      setP("");
      await refresh();
      setMsg("VUT connected.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Remove stored VUT credentials?")) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await vutApi.deleteCredentials();
      await refresh();
      setMsg("VUT credentials removed.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-3">
      <IntegrationRow
        icon={<GraduationCap size={18} />}
        name="VUT Studis"
        description="Brno University of Technology — grades, timetable, subject updates. Also enables Moodle."
        pill={
          <StatusPill
            on={!!status?.configured}
            onLabel={status?.username ? `Linked (${status.username})` : "Linked"}
            offLabel="Not linked"
          />
        }
      />
      {status?.configured ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-red-500 hover:text-white disabled:opacity-40"
          >
            <LogOut size={14} /> Disconnect
          </button>
          {busy && <Loader2 size={14} className="animate-spin text-ink-muted" />}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="VUT username (xlogin00)"
            className={inputClass}
          />
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            placeholder="Password"
            className={inputClass}
          />
          <button
            onClick={connect}
            disabled={busy || !u.trim() || !p}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Connect
          </button>
        </div>
      )}
      <MsgBox msg={msg} error={err} />
    </Card>
  );
}

function MicrosoftCard() {
  const [status, setStatus] = useState<MicrosoftCredentialStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenantId, setTenantId] = useState("common");
  const [refreshToken, setRefreshToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await microsoftApi.getCredentials();
      setStatus(s);
    } catch {
      setStatus({ hasCredentials: false, configured: false, usingEnvFallback: false });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    if (!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await microsoftApi.setCredentials(
        clientId.trim(),
        clientSecret.trim(),
        refreshToken.trim(),
        tenantId.trim() || "common"
      );
      setClientId(""); setClientSecret(""); setRefreshToken("");
      await refresh();
      setMsg("Microsoft credentials saved.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed to save credentials");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Remove your stored Microsoft credentials?")) return;
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await microsoftApi.deleteCredentials();
      await refresh();
      setMsg("Microsoft credentials removed.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      const r = await microsoftApi.sync();
      setMsg(`Synced ${r.synced} event(s), removed ${r.deleted}.`);
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const hasCreds = status?.hasCredentials ?? false;
  const configured = status?.configured ?? false;

  return (
    <Card className="mb-3">
      <IntegrationRow
        icon={<Calendar size={18} />}
        name="Microsoft Calendar"
        description="Two-way sync with Outlook calendars via Graph API. Connect your own Microsoft account."
        pill={
          <StatusPill
            on={configured}
            onLabel={hasCreds ? "Connected" : status?.usingEnvFallback ? "Server fallback" : "Connected"}
            offLabel="Not configured"
          />
        }
      />
      {hasCreds ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={sync}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink hover:bg-surface-3 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync now
          </button>
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-red-500 hover:text-white disabled:opacity-40"
          >
            <LogOut size={14} /> Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Client (App) ID">
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Azure AD App ID"
                className={inputClass}
              />
            </Field>
            <Field label="Client Secret">
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Azure AD client secret"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Tenant ID (optional)">
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="common"
                className={inputClass}
              />
            </Field>
            <Field label="Refresh Token">
              <input
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="OAuth2 refresh token"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <SaveButton busy={busy} onClick={connect} disabled={!clientId.trim() || !clientSecret.trim() || !refreshToken.trim()}>
              Connect
            </SaveButton>
            {status?.usingEnvFallback && (
              <span className="text-xs text-ink-muted">Server fallback active — add your own to override</span>
            )}
          </div>
        </div>
      )}
      <MsgBox msg={msg} error={err} />
      <p className="mt-2 text-xs text-ink-muted">
        Register an app in <a href="https://portal.azure.com" target="_blank" rel="noreferrer" className="underline">Azure Portal</a> with
        <code className="text-ink"> Calendars.ReadWrite</code> + <code className="text-ink">offline_access</code> delegated permissions.
        Use the Authorization Code flow to get a refresh token. Credentials are encrypted (AES-256-GCM).
      </p>
    </Card>
  );
}

function MoodleCard() {
  const [status, setStatus] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await moodleApi.status();
      setStatus({ configured: s.configured, authenticated: s.authenticated });
    } catch {
      setStatus({ configured: false, authenticated: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async () => {
    setBusy(true);
    setErr(false);
    setMsg(null);
    try {
      await moodleApi.login();
      await refresh();
      setMsg("Moodle authenticated.");
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <IntegrationRow
        icon={<BookOpen size={18} />}
        name="Moodle (VUT)"
        description="Browse course materials. Reuses your VUT credentials — link VUT first."
        pill={
          <StatusPill
            on={!!status?.authenticated}
            onLabel="Authenticated"
            offLabel={status?.configured ? "Linked, not signed in" : "Needs VUT"}
          />
        }
      />
      {status?.configured && !status.authenticated && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={login}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} Sign in to Moodle
          </button>
        </div>
      )}
      <MsgBox msg={msg} error={err} />
    </Card>
  );
}

function IntegrationRow({
  icon,
  name,
  description,
  pill,
  action,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  pill: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-muted">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="text-xs text-ink-muted">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {pill}
        {action}
      </div>
    </div>
  );
}

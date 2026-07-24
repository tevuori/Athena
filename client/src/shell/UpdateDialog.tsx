/**
 * In-app update dialog for the Capacitor (Android) build.
 *
 * Rendered once at the top of the React tree (see App.tsx). Reads from the
 * `useUpdater` store — any caller can surface an update by calling
 * `promptUpdate(info)`.
 *
 * States:
 *   - idle (no pending update) → renders nothing
 *   - prompt → shows version + release notes + Download & Install / Later / Skip
 *   - downloading → indeterminate spinner (the native plugin streams the APK)
 *   - installing → system installer dialog is showing; we show a waiting state
 *   - error → message + retry / dismiss
 *
 * On web/PWA builds the store is never populated, so this is a no-op.
 */
import { useState } from "react";
import { Download, X, Loader2, AlertCircle, ExternalLink, Ban } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useUpdater } from "../store/updater";
import { downloadAndInstall, skipVersion } from "../services/updater";

type Phase = "prompt" | "downloading" | "installing" | "error";

export default function UpdateDialog() {
  const { pending, dismiss } = useUpdater();
  const [phase, setPhase] = useState<Phase>("prompt");
  const [error, setError] = useState<string | null>(null);

  if (!pending) return null;

  const close = () => {
    setPhase("prompt");
    setError(null);
    dismiss();
  };

  const handleSkip = () => {
    skipVersion(pending.version);
    close();
  };

  const handleInstall = async () => {
    setPhase("downloading");
    setError(null);
    try {
      // Resolves once the system installer intent has been launched.
      await downloadAndInstall(pending);
      setPhase("installing");
      // The user is now in Android's system install UI. We leave the dialog
      // showing an "installing" state; if they cancel the system dialog and
      // return to Athena, they can dismiss this manually.
    } catch (e: any) {
      setPhase("error");
      setError(e?.message || "Download failed. Check your connection and try again.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-edge bg-surface-2 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-edge p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Download size={18} />
            </div>
            <div>
              <h2 id="update-dialog-title" className="text-sm font-semibold text-ink">
                Update available
              </h2>
              <p className="text-xs text-ink-muted">Athena v{pending.version}</p>
            </div>
          </div>
          {phase !== "downloading" && phase !== "installing" && (
            <button
              onClick={close}
              className="rounded-md p-1 text-ink-muted hover:bg-surface-3 hover:text-ink"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[50vh] overflow-y-auto p-4">
          {phase === "error" ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Couldn’t install the update</p>
                <p className="mt-1 text-xs text-red-300/80">{error}</p>
              </div>
            </div>
          ) : phase === "installing" ? (
            <div className="flex items-center gap-2.5 py-2 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" />
              <span>
                Android is installing the update. Confirm in the system dialog, then reopen
                Athena.
              </span>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink-muted">
                {pending.publishedAt
                  ? `Released ${new Date(pending.publishedAt).toLocaleDateString()}`
                  : "A new version is available."}
              </p>
              {pending.notes ? (
                <div className="prose prose-sm prose-invert max-w-none text-sm text-ink-muted [&_a]:text-accent [&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
                  <ReactMarkdown>{pending.notes}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No release notes provided.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-edge p-3">
          {phase === "downloading" ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" />
              <span>Downloading…</span>
            </div>
          ) : phase === "installing" ? (
            <button
              onClick={close}
              className="rounded-lg border border-edge px-3 py-2 text-sm text-ink hover:bg-surface-3"
            >
              Dismiss
            </button>
          ) : phase === "error" ? (
            <>
              <button
                onClick={close}
                className="rounded-lg border border-edge px-3 py-2 text-sm text-ink hover:bg-surface-3"
              >
                Close
              </button>
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Download size={14} /> Retry
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSkip}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface-3 hover:text-ink"
              >
                <Ban size={14} /> Skip this version
              </button>
              <a
                href={pending.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-sm text-ink hover:bg-surface-3"
              >
                <ExternalLink size={14} /> View on GitHub
              </a>
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Download size={14} /> Download &amp; Install
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

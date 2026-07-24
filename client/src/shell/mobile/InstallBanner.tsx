import { useState, useEffect } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";
import { usePwaInstall } from "./usePwaInstall";

const DISMISS_KEY = "athena.pwa-install-dismissed";
const DISMISS_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * A slim banner that appears at the top of the mobile home screen prompting
 * the user to install Athena as a PWA. On Android/Chrome it triggers the
 * native install prompt; on iOS it shows "Add to Home Screen" instructions.
 */
export default function InstallBanner() {
  const { canInstall, promptInstall, isIOS } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (!canInstall) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const age = Date.now() - parseInt(dismissed, 10);
      if (age < DISMISS_TTL) return; // still within dismiss window
    }
    // Small delay so it doesn't flash on first load.
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [canInstall]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div className="safe-top flex items-center gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2.5">
        <Download size={18} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Install Athena</p>
          <p className="text-xs text-ink-muted">Add to your home screen for a full-screen app experience</p>
        </div>
        <button
          onClick={() => (isIOS ? setShowIosHelp(true) : promptInstall())}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg active:opacity-80"
        >
          Install
        </button>
        <button onClick={dismiss} className="shrink-0 text-ink-muted active:text-ink">
          <X size={18} />
        </button>
      </div>

      {/* iOS instructions overlay */}
      {showIosHelp && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 p-6" onClick={() => setShowIosHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-edge bg-surface-2 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold text-ink">Install on iOS</h3>
            <ol className="space-y-3 text-sm text-ink-muted">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-ink">1</span>
                <span>Tap the <Share size={14} className="inline" /> Share button in Safari's toolbar</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-ink">2</span>
                <span>Scroll down and tap <PlusSquare size={14} className="inline" /> "Add to Home Screen"</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-ink">3</span>
                <span>Tap "Add" — Athena will appear on your home screen</span>
              </li>
            </ol>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-fg"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

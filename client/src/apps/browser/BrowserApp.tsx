import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, ArrowRight, RotateCw, Home, Globe, ExternalLink,
  Loader2, AlertCircle, Search, Lock, Trash2,
} from "lucide-react";
import { useWindows } from "../../store/windows";
import { useBrowser, type NavRequest } from "../../store/browser";
import { useShowControl } from "../../store/showControl";
import { browserApi } from "../../services/browser";
import type { WindowInstance } from "../../store/windows";

const HOME_URL = "athena://home";

/** Quick links for the start page. */
const QUICK_LINKS: { name: string; url: string; color: string; icon: string }[] = [
  { name: "Wikipedia", url: "https://en.wikipedia.org", color: "#6366f1", icon: "W" },
  { name: "DuckDuckGo", url: "https://duckduckgo.com", color: "#de5833", icon: "D" },
  { name: "GitHub", url: "https://github.com", color: "#24292e", icon: "G" },
  { name: "YouTube", url: "https://youtube.com", color: "#ff0000", icon: "Y" },
  { name: "Reddit", url: "https://reddit.com", color: "#ff4500", icon: "R" },
  { name: "Stack Overflow", url: "https://stackoverflow.com", color: "#f48024", icon: "S" },
  { name: "MDN", url: "https://developer.mozilla.org", color: "#000000", icon: "M" },
  { name: "arXiv", url: "https://arxiv.org", color: "#b31b1b", icon: "a" },
];

/** Normalize user input into a URL (prefix https:// for bare domains, else search). */
function normalizeInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return HOME_URL;
  if (trimmed === HOME_URL) return HOME_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed) && !/\s/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

/** Pretty-print a URL for the address bar. */
function prettyUrl(url: string): string {
  if (url === HOME_URL) return "";
  return url;
}

export default function BrowserApp({ win }: { win: WindowInstance }) {
  const setTitle = useWindows((s) => s.setTitle);
  const setUrl = useBrowser((s) => s.setUrl);
  const removeWindow = useBrowser((s) => s.removeWindow);
  const navRequests = useBrowser((s) => s.navRequests);

  // Per-window history stack (back/forward).
  const [history, setHistory] = useState<string[]>(() => {
    const initial = (win.payload?.url as string) ?? HOME_URL;
    return [initial];
  });
  const [historyIdx, setHistoryIdx] = useState(0);
  const [addressValue, setAddressValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0); // bump to force reload
  const [renderFailed, setRenderFailed] = useState(false);
  const lastProcessedSeq = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUrl = history[historyIdx] ?? HOME_URL;
  const isHome = currentUrl === HOME_URL;

  // Keep address bar in sync when navigating (not while editing).
  useEffect(() => {
    setAddressValue(prettyUrl(currentUrl));
  }, [currentUrl]);

  // Update window title + shared browser state when URL changes.
  useEffect(() => {
    if (isHome) {
      setTitle(win.id, "Browser");
      setUrl(win.id, "");
    } else {
      setTitle(win.id, "Browser");
      setUrl(win.id, currentUrl);
    }
  }, [currentUrl, isHome, win.id, setTitle, setUrl]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => removeWindow(win.id);
  }, [win.id, removeWindow]);

  /** Navigate to a URL, pushing onto the history stack. */
  const navigate = useCallback(
    (rawUrl: string, opts?: { replace?: boolean }) => {
      const url = normalizeInput(rawUrl);
      setError(null);
      setHistory((prev) => {
        if (opts?.replace && prev.length > 0) {
          const next = [...prev];
          next[historyIdx] = url;
          return next;
        }
        // Truncate any forward history.
        const base = prev.slice(0, historyIdx + 1);
        // Skip if same as current.
        if (base[base.length - 1] === url) return prev;
        return [...base, url];
      });
      if (!opts?.replace) {
        setHistoryIdx((idx) => {
          if (history[idx] === url) return idx;
          return idx + 1;
        });
      }
    },
    [history, historyIdx]
  );

  const goBack = useCallback(() => {
    if (historyIdx > 0) {
      setError(null);
      setHistoryIdx((i) => i - 1);
    }
  }, [historyIdx]);

  const goForward = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setError(null);
      setHistoryIdx((i) => i + 1);
    }
  }, [historyIdx, history.length]);

  const reload = useCallback(() => {
    setError(null);
    setIframeKey((k) => k + 1);
  }, []);

  const goHome = useCallback(() => {
    navigate(HOME_URL);
  }, [navigate]);

  // Listen for postMessage from the proxied page. Two message types:
  //  - __athenaBrowser: the page reports its real (post-redirect) URL + title
  //    so the address bar + history stay in sync.
  //  - __athenaBrowserNav: a SPA called history.pushState/replaceState with a
  //    new URL — navigate the iframe to the proxy URL for that page (full
  //    reload through the proxy, keeping everything consistent).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.__athenaBrowserNav) {
        const navUrl = String(data.url ?? "");
        if (navUrl) navigate(navUrl);
        return;
      }
      if (!data.__athenaBrowser) return;
      const realUrl = String(data.url ?? "");
      const pageTitle = String(data.title ?? "");
      if (!realUrl) return;
      // Update the shared browser state + window title with the real URL.
      setUrl(win.id, realUrl);
      if (pageTitle) setTitle(win.id, pageTitle.length > 60 ? pageTitle.slice(0, 57) + "…" : pageTitle);
      // If the real URL differs from what we requested (redirect), replace it
      // in history so back goes to the previous page, not the pre-redirect URL.
      setHistory((prev) => {
        if (prev[historyIdx] === realUrl) return prev;
        const next = [...prev];
        next[historyIdx] = realUrl;
        return next;
      });
      setAddressValue(prettyUrl(realUrl));
      setLoading(false);
      setRenderFailed(false);
      // The page reported back successfully — cancel the fail timer so it
      // doesn't fire later and show a false "failed to render" notice.
      if (failTimerRef.current) {
        clearTimeout(failTimerRef.current);
        failTimerRef.current = null;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [win.id, historyIdx, setUrl, setTitle, navigate]);

  // Process navigation commands from Athena (via the shared browser store).
  const currentReq = navRequests[win.id];
  useEffect(() => {
    if (!currentReq || currentReq.seq === lastProcessedSeq.current) return;
    lastProcessedSeq.current = currentReq.seq;
    switch (currentReq.kind) {
      case "navigate":
        if (currentReq.url) navigate(currentReq.url);
        break;
      case "back":
        goBack();
        break;
      case "forward":
        goForward();
        break;
      case "reload":
        reload();
        break;
    }
  }, [currentReq, navigate, goBack, goForward, reload]);

  // Interactive Teacher: consume show-control commands (scroll_to / highlight
  // / clear_highlight) and forward them into the proxied iframe via
  // postMessage. The injected content script (services/browser.ts) handles
  // them by scrolling to / highlighting the target text or selector.
  const showCommands = useShowControl((s) => s.commands);
  const removeShowWindow = useShowControl((s) => s.removeWindow);
  const lastShowSeq = useRef(0);
  const showCmd = showCommands[win.id];
  useEffect(() => {
    if (!showCmd || showCmd.seq === lastShowSeq.current) return;
    lastShowSeq.current = showCmd.seq;
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    if (showCmd.kind === "scroll_to" || showCmd.kind === "highlight" || showCmd.kind === "clear_highlight") {
      iframe.contentWindow.postMessage(
        {
          __athenaTeacherShow: true,
          kind: showCmd.kind,
          text: showCmd.text,
          selector: showCmd.selector,
          line: showCmd.line,
        },
        "*"
      );
    }
  }, [showCmd]);
  useEffect(() => {
    return () => { if (win.id) removeShowWindow(win.id); };
  }, [win.id, removeShowWindow]);

  // Set loading true when the iframe starts loading a new URL; the postMessage
  // handler clears it when the page reports back. Also clear on home.
  // If no postMessage arrives within 12s, assume the page failed to render
  // through the proxy (heavy SPAs / consent walls / frame-busting JS) and show
  // a fallback notice with an "Open in new tab" button.
  useEffect(() => {
    if (failTimerRef.current) {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    if (isHome) {
      setLoading(false);
      setRenderFailed(false);
      return;
    }
    setLoading(true);
    setRenderFailed(false);
    failTimerRef.current = setTimeout(() => {
      setRenderFailed(true);
      setLoading(false);
      failTimerRef.current = null;
    }, 12000);
    return () => {
      if (failTimerRef.current) {
        clearTimeout(failTimerRef.current);
        failTimerRef.current = null;
      }
    };
  }, [isHome, currentUrl, iframeKey]);

  const openExternal = useCallback(() => {
    if (!isHome) window.open(currentUrl, "_blank", "noopener,noreferrer");
  }, [currentUrl, isHome]);

  const clearSession = useCallback(async () => {
    try {
      await browserApi.clearCookies();
      reload();
    } catch {
      /* ignore */
    }
  }, [reload]);

  const onAddressEnter = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        navigate(addressValue);
        (e.target as HTMLInputElement).blur();
      } else if (e.key === "Escape") {
        setAddressValue(prettyUrl(currentUrl));
        (e.target as HTMLInputElement).blur();
      }
    },
    [addressValue, currentUrl, navigate]
  );

  const proxySrc = useMemo(
    () => (isHome ? "" : browserApi.proxyUrl(currentUrl)),
    [isHome, currentUrl]
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-edge bg-surface-2 px-2 py-1.5">
        <NavBtn onClick={goBack} disabled={historyIdx === 0} title="Back">
          <ArrowLeft size={16} />
        </NavBtn>
        <NavBtn
          onClick={goForward}
          disabled={historyIdx >= history.length - 1}
          title="Forward"
        >
          <ArrowRight size={16} />
        </NavBtn>
        <NavBtn onClick={reload} disabled={isHome} title="Reload" className="@3xl:flex hidden">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
        </NavBtn>
        <NavBtn onClick={goHome} title="Home" className="@3xl:flex hidden">
          <Home size={16} />
        </NavBtn>

        {/* Address bar */}
        <div className="relative mx-1 flex flex-1 items-center">
          <div className="pointer-events-none absolute left-2.5 text-ink-muted">
            {isHome ? <Search size={13} /> : <Lock size={12} />}
          </div>
          <input
            type="text"
            value={addressValue}
            onChange={(e) => setAddressValue(e.target.value)}
            onKeyDown={onAddressEnter}
            onFocus={(e) => e.target.select()}
            placeholder="Search DuckDuckGo or type a URL"
            className="w-full rounded-full border border-edge bg-surface py-1 pl-8 pr-3 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            spellCheck={false}
          />
        </div>

        <NavBtn onClick={openExternal} disabled={isHome} title="Open in new tab" className="@3xl:flex hidden">
          <ExternalLink size={15} />
        </NavBtn>
        <NavBtn onClick={clearSession} title="Clear session (log out)" className="@3xl:flex hidden">
          <Trash2 size={15} />
        </NavBtn>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden bg-white">
        {isHome ? (
          <StartPage onNavigate={navigate} />
        ) : (
          <>
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={proxySrc}
              className={`h-full w-full border-0 bg-white ${renderFailed ? "opacity-0" : "opacity-100"}`}
              title="Browser"
              sandbox="allow-same-origin allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => {
                // postMessage handler is the primary signal; onLoad is a fallback.
                setTimeout(() => setLoading(false), 300);
              }}
              onError={() => {
                setError("Failed to load page");
                setLoading(false);
              }}
            />
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface text-ink-muted">
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm">{error}</p>
                <button
                  onClick={reload}
                  className="mt-1 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-fg"
                >
                  <RotateCw size={13} /> Retry
                </button>
              </div>
            )}
            {renderFailed && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface px-6 text-center text-ink-muted">
                <AlertCircle size={36} className="text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-ink">This site may not render in the embedded browser</p>
                  <p className="mt-1 max-w-md text-xs">
                    Some sites (YouTube, Google, heavy SPAs with consent walls or frame-busting
                    scripts) don't work through the proxy. You can still open it in a real browser tab.
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={openExternal}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs text-accent-fg"
                  >
                    <ExternalLink size={13} /> Open in new tab
                  </button>
                  <button
                    onClick={reload}
                    className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
                  >
                    <RotateCw size={13} /> Retry
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NavBtn({
  onClick,
  disabled,
  title,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${className}`}
    >
      {children}
    </button>
  );
}

function StartPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [query, setQuery] = useState("");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-surface px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Globe size={28} />
        </div>
        <h1 className="text-lg font-semibold text-ink">Browser</h1>
        <p className="text-xs text-ink-muted">Search the web or open a site</p>
      </div>

      <form
        className="w-full max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) onNavigate(query);
        }}
      >
        <div className="relative flex items-center">
          <Search size={16} className="pointer-events-none absolute left-3.5 text-ink-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search DuckDuckGo or type a URL"
            className="w-full rounded-full border border-edge bg-surface-2 py-2.5 pl-11 pr-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            spellCheck={false}
          />
        </div>
      </form>

      <div className="grid w-full max-w-xl grid-cols-3 @3xl:grid-cols-4 gap-3">
        {QUICK_LINKS.map((link) => (
          <button
            key={link.url}
            onClick={() => onNavigate(link.url)}
            className="flex flex-col items-center gap-2 rounded-xl border border-edge bg-surface-2 p-3 transition-colors hover:border-accent hover:bg-surface-3"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: link.color }}
            >
              {link.icon}
            </div>
            <span className="line-clamp-1 text-[11px] text-ink-muted">{link.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import type { ToolDef } from "./plugin";
import { fetchPageText } from "../../browser";

// Browser tools. The navigation tools are clientAction: the server returns a
// payload and the Athena client dispatches it to the Browser app (opening a
// window if needed, setting its URL, or triggering back/forward/reload).
// get_browser_content is server-side: it fetches the page the browser is
// currently showing (via the per-user cookie jar) and extracts its text so
// Athena can read what the user is looking at.

/** Build a URL from a query: if it's not a URL, treat it as a DuckDuckGo search. */
function resolveTargetUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://duckduckgo.com/";
  // Already a URL?
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  // Looks like a domain (has a dot, no spaces)?
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed) && !/\s/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  // Otherwise treat as a search query.
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export const browserTools: ToolDef[] = [
  {
    name: "open_browser",
    description:
      "Open the Browser app on the user's desktop and navigate to a URL or search query. Use this when the user asks to open, visit, show, or look at a website, or for web questions where seeing the page would help. If the input is not a URL (e.g. 'wikipedia python'), it becomes a DuckDuckGo search. If a Browser window is already open, it is focused and navigated instead of opening a new one.",
    clientAction: true,
    parameters: [
      {
        name: "url",
        type: "string",
        description: "URL or search query to open (e.g. 'https://en.wikipedia.org/wiki/Python' or 'python tutorial').",
        required: true,
      },
    ],
    handler: async (args) => {
      const target = resolveTargetUrl(String(args.url ?? ""));
      return { action: "open_browser", url: target };
    },
  },
  {
    name: "navigate_browser",
    description:
      "Navigate an already-open Browser window to a new URL or search query. Use the window id from 'Open windows' / list_open_windows. If omitted, the most recently focused browser window is used.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Browser window id (from list_open_windows). Optional — defaults to the focused browser window." },
      {
        name: "url",
        type: "string",
        description: "URL or search query to navigate to.",
        required: true,
      },
    ],
    handler: async (args) => {
      const target = resolveTargetUrl(String(args.url ?? ""));
      return {
        action: "navigate_browser",
        url: target,
        ...(args.windowId ? { windowId: String(args.windowId) } : {}),
      };
    },
  },
  {
    name: "browser_back",
    description: "Go back in the browser history of a Browser window. Requires an open Browser window.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Browser window id (optional — defaults to the focused browser window)." },
    ],
    handler: async (args) => ({
      action: "browser_back",
      ...(args.windowId ? { windowId: String(args.windowId) } : {}),
    }),
  },
  {
    name: "browser_forward",
    description: "Go forward in the browser history of a Browser window.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Browser window id (optional — defaults to the focused browser window)." },
    ],
    handler: async (args) => ({
      action: "browser_forward",
      ...(args.windowId ? { windowId: String(args.windowId) } : {}),
    }),
  },
  {
    name: "browser_reload",
    description: "Reload the current page in a Browser window.",
    clientAction: true,
    parameters: [
      { name: "windowId", type: "string", description: "Browser window id (optional — defaults to the focused browser window)." },
    ],
    handler: async (args) => ({
      action: "browser_reload",
      ...(args.windowId ? { windowId: String(args.windowId) } : {}),
    }),
  },
  {
    name: "get_browser_content",
    description:
      "Read the main text content of the page currently shown in a Browser window (or an explicit URL). Uses the user's browser cookie jar, so logged-in pages are read correctly. Returns { url, title, content, truncated }. Use this when the user asks what's on the current page, or to extract information from a page they're viewing. Prefer open_browser first if no browser window is open.",
    parameters: [
      { name: "windowId", type: "string", description: "Browser window id whose current URL to read (optional — defaults to the focused browser window)." },
      { name: "url", type: "string", description: "Explicit URL to read instead of a window's current URL (optional)." },
    ],
    handler: async (args, ctx) => {
      let url = String(args.url ?? "").trim();
      if (!url) {
        // Find the current URL from the open browser windows in context.
        const wins = ctx.windows ?? [];
        const browserWins = wins.filter((w) => w.appId === "browser" && (w as any).browserUrl);
        let target: any;
        if (args.windowId) {
          target = browserWins.find((w) => w.id === String(args.windowId));
        }
        if (!target) {
          // Prefer the focused browser window, else the last one.
          target = browserWins.find((w) => w.focused) ?? browserWins[browserWins.length - 1];
        }
        url = target?.browserUrl ?? "";
      }
      if (!url) {
        return {
          error:
            "No browser window is open and no url was provided. Open the Browser first with open_browser, or pass an explicit url.",
        };
      }
      try {
        const page = await fetchPageText(ctx.userId, url);
        return page;
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to read page content" };
      }
    },
  },
];

// ===== General-purpose web browser reverse proxy =====
// Fetches an arbitrary http/https page, rewrites all URLs so navigation stays
// inside the proxy (so it can be embedded in an iframe), strips frame-blocking
// headers/meta, and injects a postMessage script so the parent window (the
// Browser app) can keep its address bar in sync with the real URL.
//
// A per-user in-memory cookie jar persists login sessions across navigations
// (refreshed on each request, ~24h TTL). Cookies are scoped per host.

import { load } from "cheerio";
import { isBlockedHost, validateUrl } from "./fetcher";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0 Athena/1.0 (+https://github.com/athena/student-os)";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 8;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB raw HTML cap
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ===== Per-user cookie jar =====

interface CookieEntry {
  name: string;
  value: string;
  domain: string; // host (hostname) the cookie was set for
  path: string;
  expires?: number; // epoch ms; if absent, session cookie
}

interface BrowserSession {
  cookies: CookieEntry[];
  expiresAt: number;
}

const sessions = new Map<string, BrowserSession>();

function getSession(userId: string): BrowserSession {
  const now = Date.now();
  let s = sessions.get(userId);
  if (!s || s.expiresAt < now) {
    s = { cookies: [], expiresAt: now + SESSION_TTL_MS };
    sessions.set(userId, s);
  }
  // Refresh TTL on activity.
  s.expiresAt = now + SESSION_TTL_MS;
  return s;
}

/** Parse a single Set-Cookie header value into a CookieEntry. */
function parseSetCookie(header: string, requestHost: string, requestPath: string): CookieEntry | null {
  if (!header) return null;
  const parts = header.split(";");
  if (!parts.length) return null;
  const nv = parts[0].trim();
  const eq = nv.indexOf("=");
  if (eq < 0) return null;
  const name = nv.slice(0, eq).trim();
  const value = nv.slice(eq + 1).trim();
  if (!name) return null;
  let domain = requestHost;
  let path = "/";
  let expires: number | undefined;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].trim();
    const peq = p.indexOf("=");
    const k = (peq >= 0 ? p.slice(0, peq) : p).trim().toLowerCase();
    const v = peq >= 0 ? p.slice(peq + 1).trim() : "";
    if (k === "domain" && v) {
      // Normalize: strip leading dot.
      domain = v.replace(/^\./, "").toLowerCase();
    } else if (k === "path" && v) {
      path = v;
    } else if (k === "max-age" && v) {
      const secs = parseInt(v, 10);
      if (!isNaN(secs)) expires = secs > 0 ? Date.now() + secs * 1000 : 0;
    } else if (k === "expires" && v) {
      const t = Date.parse(v);
      if (!isNaN(t)) expires = t;
    }
  }
  return { name, value, domain, path, expires };
}

/** True if a cookie applies to the given host (domain match). */
function cookieMatchesHost(c: CookieEntry, host: string): boolean {
  const h = host.toLowerCase();
  const d = c.domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

/** True if a cookie applies to the given path. */
function cookieMatchesPath(c: CookieEntry, path: string): boolean {
  if (!c.path || c.path === "/") return true;
  const p = path || "/";
  return p === c.path || p.startsWith(c.path.endsWith("/") ? c.path : c.path + "/");
}

/** Build a Cookie header string for the given URL from the user's jar. */
function cookieHeader(session: BrowserSession, url: URL): string {
  const now = Date.now();
  const valid = session.cookies.filter(
    (c) => (c.expires === undefined || c.expires > now) &&
      cookieMatchesHost(c, url.hostname) &&
      cookieMatchesPath(c, url.pathname || "/")
  );
  if (!valid.length) return "";
  return valid.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Merge Set-Cookie headers from a response into the user's jar. */
function absorbSetCookies(
  session: BrowserSession,
  setCookieHeaders: string[],
  requestUrl: URL
): void {
  const now = Date.now();
  for (const raw of setCookieHeaders) {
    const entry = parseSetCookie(raw, requestUrl.hostname, requestUrl.pathname || "/");
    if (!entry) continue;
    // Delete: expires in the past or max-age=0 → remove matching cookie.
    if (entry.expires !== undefined && entry.expires <= now) {
      session.cookies = session.cookies.filter(
        (c) => !(c.name === entry.name && c.domain === entry.domain && c.path === entry.path)
      );
      continue;
    }
    // Upsert.
    const idx = session.cookies.findIndex(
      (c) => c.name === entry.name && c.domain === entry.domain && c.path === entry.path
    );
    if (idx >= 0) session.cookies[idx] = entry;
    else session.cookies.push(entry);
  }
}

/** Clear a user's cookie jar (log out / clear session). */
export function clearBrowserSession(userId: string): void {
  sessions.delete(userId);
}

// ===== Fetching =====

interface FetchResult {
  buffer: Buffer;
  finalUrl: string;
  contentType: string;
}

/** Fetch a resource following redirects manually, validating each hop + collecting cookies. */
async function fetchResource(
  userId: string,
  url: URL
): Promise<FetchResult> {
  const session = getSession(userId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let current = url;
  let redirects = 0;
  try {
    for (;;) {
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };
      const cookie = cookieHeader(session, current);
      if (cookie) headers["Cookie"] = cookie;

      const res = await fetch(current, {
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      // Absorb any Set-Cookie from this hop.
      const setCookies = res.headers.getSetCookie?.() ?? [];
      if (setCookies.length) absorbSetCookies(session, setCookies, current);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || ++redirects > MAX_REDIRECTS) {
          throw new Error("Too many redirects");
        }
        current = new URL(loc, current);
        if (isBlockedHost(current.hostname)) {
          throw new Error(`Redirect to blocked host '${current.hostname}'`);
        }
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      // Read with a size cap.
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) {
            await reader.cancel();
            throw new Error("Response too large (max 8 MB)");
          }
          chunks.push(value);
        }
      }
      const buffer = Buffer.concat(chunks);
      return { buffer, finalUrl: current.toString(), contentType };
    }
  } finally {
    clearTimeout(timer);
  }
}

// ===== URL rewriting + page injection =====

/**
 * Script injected into every proxied HTML page. Runs before the page's own
 * scripts (injected at the top of <head>) so it can patch the runtime APIs
 * that sites use for navigation + data loading:
 *  - fetch / XMLHttpRequest: rewrite same-origin + relative URLs to route
 *    through the proxy (so /youtubei/v1/... hits the proxy, which passes the
 *    JSON response through).
 *  - Link clicks: intercept ALL <a> clicks (including dynamically-created
 *    links), resolve the raw href against the real page URL, and navigate
 *    the iframe to the proxy URL for that page.
 *  - history.pushState / replaceState: postMessage the target URL to the
 *    parent so the Browser app navigates the iframe to the proxy URL.
 *  - location.href / .assign / .replace: intercept JS redirects.
 *  - Form submissions: intercept GET forms, serialize + navigate to proxy.
 *  - window.open: open real URLs directly in a new browser tab.
 *  - Reports the real final URL + title to the parent for address-bar sync.
 */
const INTERCEPT_SCRIPT = `<script>(function(){
  var ORIGIN = __ATHENA_ORIGIN__;
  var FINAL_URL = __ATHENA_FINAL_URL__;
  var PROXY = "/api/browser/proxy?url=";
  var TOKEN = __ATHENA_TOKEN__;
  function toProxy(u) {
    try {
      if (!u) return u;
      var s = String(u);
      if (!s || s.charAt(0) === "#" || /^(javascript|mailto|tel|data|blob):/i.test(s)) return s;
      if (s.indexOf(PROXY) >= 0 || s.indexOf("/api/browser/") === 0) return s;
      var abs = new URL(s, FINAL_URL);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return s;
      return PROXY + encodeURIComponent(abs.href) + (TOKEN ? "&token=" + encodeURIComponent(TOKEN) : "");
    } catch(e) { return u; }
  }
  // --- fetch ---
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      try {
        if (typeof input === "string") input = toProxy(input);
        else if (input && input.url) input = new Request(toProxy(input.url), input);
      } catch(e) {}
      return origFetch.call(this, input, init);
    };
  }
  // --- XMLHttpRequest ---
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    arguments[1] = toProxy(url);
    return origOpen.apply(this, arguments);
  };
  // --- history.pushState / replaceState ---
  function navToParent(url) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __athenaBrowserNav: true, url: new URL(url, FINAL_URL).href }, "*");
      }
    } catch(e) {}
  }
  var origPush = history.pushState;
  history.pushState = function(state, title, url) {
    if (url) { navToParent(url); return; }
    return origPush.apply(this, arguments);
  };
  var origReplace = history.replaceState;
  history.replaceState = function(state, title, url) {
    if (url) { navToParent(url); return; }
    return origReplace.apply(this, arguments);
  };
  // --- location.href / .assign / .replace ---
  try {
    var origAssign = Location.prototype.assign;
    Location.prototype.assign = function(url) { return origAssign.call(this, toProxy(url)); };
    var origReplaceLoc = Location.prototype.replace;
    Location.prototype.replace = function(url) { return origReplaceLoc.call(this, toProxy(url)); };
    var hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, "href");
    if (hrefDesc && hrefDesc.set) {
      var origHrefSet = hrefDesc.set;
      Object.defineProperty(Location.prototype, "href", {
        get: hrefDesc.get,
        set: function(url) { return origHrefSet.call(this, toProxy(url)); },
        configurable: true,
      });
    }
  } catch(e) {}
  // --- window.open (open real URL in a real new tab, not proxied) ---
  var origWinOpen = window.open;
  window.open = function(url, target, features) {
    try {
      if (url) {
        var s = String(url);
        if (/^https?:/i.test(s) && s.indexOf(PROXY) < 0) {
          return origWinOpen.call(this, s, target || "_blank", features);
        }
      }
    } catch(e) {}
    return origWinOpen.apply(this, arguments);
  };
  // --- link click interceptor (handles static + dynamically-created links) ---
  // Reads the RAW href (cheerio doesn't rewrite links), resolves it against
  // the real page URL, and postMessages the parent to navigate. This keeps
  // the BrowserApp's history stack consistent and ensures the proxy URL
  // includes the auth token.
  document.addEventListener("click", function(e) {
    try {
      var link = e.target;
      while (link && link.tagName !== "A") link = link.parentElement;
      if (!link || !link.getAttribute) return;
      var rawHref = link.getAttribute("href");
      if (!rawHref) return;
      // Skip non-navigational hrefs.
      if (rawHref.charAt(0) === "#" || /^(javascript|mailto|tel):/i.test(rawHref)) return;
      // Resolve the raw href against the real page URL.
      var abs = new URL(rawHref, FINAL_URL);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey || link.target === "_blank") {
        // Open real URL in a new browser tab (not proxied).
        window.open(abs.href, "_blank");
      } else {
        // Ask the parent (BrowserApp) to navigate — it pushes onto history
        // and sets the iframe src to a tokenized proxy URL.
        navToParent(abs.href);
      }
    } catch(err) {}
  }, true);
  // --- form submit interceptor (GET forms) ---
  document.addEventListener("submit", function(e) {
    try {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var method = (form.getAttribute("method") || "get").toLowerCase();
      if (method !== "get") return; // POST forms: leave as-is for now
      var action = form.getAttribute("action") || FINAL_URL;
      e.preventDefault();
      var url = new URL(action, FINAL_URL);
      var params = new URLSearchParams(new FormData(form));
      url.search = params.toString();
      // Ask the parent to navigate to the form target.
      navToParent(url.toString());
    } catch(err) {}
  }, true);
  // --- report real URL + title to parent ---
  function report() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __athenaBrowser: true, url: FINAL_URL, title: document.title || "" }, "*");
      }
    } catch(e) {}
  }
  report();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(report, 50); });
  } else { setTimeout(report, 50); }
})();<\/script>`;

export type ProxiedPage =
  | { kind: "html"; html: string; finalUrl: string; title: string }
  | { kind: "raw"; buffer: Buffer; contentType: string; finalUrl: string };

/** Fetch + rewrite a page for iframe embedding (HTML) or pass through (non-HTML). */
export async function proxyPage(
  userId: string,
  rawUrl: string,
  token?: string
): Promise<ProxiedPage> {
  const u = validateUrl(rawUrl);
  const { buffer, finalUrl, contentType } = await fetchResource(userId, u);

  // Non-HTML responses (JSON API calls, images, etc.) pass through untouched
  // so runtime fetch/XHR calls from SPAs work through the proxy.
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    return { kind: "raw", buffer, contentType: contentType || "application/octet-stream", finalUrl };
  }

  const html = buffer.toString("utf-8");
  const final = new URL(finalUrl);
  const $ = load(html);

  // NOTE: We deliberately do NOT rewrite <a> hrefs via cheerio. Rewritten
  // proxy links would (a) lack the auth token → 401, and (b) navigate the
  // iframe directly, bypassing the BrowserApp's history stack. Instead, the
  // injected click interceptor (document-level capture listener) reads each
  // link's RAW href, resolves it against the real page URL, and postMessages
  // the parent to navigate — which pushes onto history + builds a tokenized
  // proxy URL. This handles static AND dynamically-created links uniformly.
  // The <base> tag is safe now that no cheerio-rewritten proxy links exist —
  // it only helps unrewritten relative resources (CSS url(), dynamic JS
  // loads) resolve against the real origin instead of the proxy origin.
  if ($("base").length === 0) {
    $("head").prepend(`<base href="${finalUrl}">`);
  }

  // Make relative resource URLs absolute (CSS/JS/images) so they load directly
  // from origin (not through the proxy — avoids content-type issues).
  $("link[href], script[src], img[src], source[src], video[src], audio[src], iframe[src]").each((_, el) => {
    const tag = el.tagName;
    const attr = tag === "link" ? "href" : "src";
    const val = $(el).attr(attr);
    if (val && !val.startsWith("http") && !val.startsWith("data:") && !val.startsWith("#") && !val.startsWith("//")) {
      try {
        const abs = new URL(val, final);
        $(el).attr(attr, abs.toString());
      } catch { /* leave */ }
    } else if (val && val.startsWith("//")) {
      try {
        const abs = new URL(val, `https:${val}`);
        $(el).attr(attr, abs.toString());
      } catch { /* leave */ }
    }
  });

  // Strip frame-blocking meta tags.
  $('meta[http-equiv="X-Frame-Options"]').remove();
  $('meta[http-equiv="Content-Security-Policy"]').remove();

  // Inject the runtime interception script (fetch/XHR/pushState + URL report)
  // at the TOP of <head> so it patches APIs before the page's scripts run.
  const interceptScript = INTERCEPT_SCRIPT
    .replace("__ATHENA_ORIGIN__", JSON.stringify(final.origin))
    .replace("__ATHENA_FINAL_URL__", JSON.stringify(finalUrl))
    .replace("__ATHENA_TOKEN__", JSON.stringify(token ?? ""));
  $("head").prepend(interceptScript);

  const title = $("title").first().text().trim() || finalUrl;
  return { kind: "html", html: $.html(), finalUrl, title };
}

// ===== Page text extraction (for Athena's get_browser_content tool) =====

export interface BrowserPageText {
  url: string;
  finalUrl: string;
  title: string;
  content: string;
  contentLength: number;
  truncated: boolean;
}

/** Fetch a URL through the user's cookie jar and extract main article text. */
export async function fetchPageText(
  userId: string,
  rawUrl: string,
  maxChars = 20_000
): Promise<BrowserPageText> {
  const u = validateUrl(rawUrl);
  const { buffer, finalUrl } = await fetchResource(userId, u);
  const html = buffer.toString("utf-8");
  const $ = load(html);
  $("script, style, noscript, iframe, nav, header, footer, aside, form, button, svg").remove();
  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    finalUrl;
  const main =
    $("article").first().text() ||
    $("main").first().text() ||
    $("[role=main]").first().text() ||
    $(".content, .article, .post, .entry-content, #content").first().text() ||
    $("body").text();
  let content = (main || "").replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  let truncated = false;
  if (content.length > maxChars) {
    content = content.slice(0, maxChars);
    truncated = true;
  }
  return {
    url: u.toString(),
    finalUrl,
    title: title.slice(0, 500),
    content,
    contentLength: content.length,
    truncated,
  };
}

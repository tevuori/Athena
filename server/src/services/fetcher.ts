// ===== URL fetcher with Readability extraction =====
// Fetches a web page, strips scripts/nav/boilerplate, and extracts the main
// article content using @postlight/parser (Readability-based). Falls back to
// cheerio-based heuristics if Parser returns empty. Includes SSRF protection.

import * as Parser from "@postlight/parser";
import { load } from "cheerio";

export interface FetchedPage {
  title: string;
  url: string;
  /** Final URL after redirects. */
  finalUrl: string;
  content: string;
  contentLength: number;
  truncated: boolean;
  fetchedAt: string;
}

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0 Athena/1.0 (+https://github.com/athena/student-os)";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB raw HTML cap

/** Block private/loopback/link-local/CGNAT ranges to prevent SSRF. */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[+|\]+$/g, "");
  if (h === "localhost") return true;
  if (h.endsWith(".local")) return true;
  if (h.endsWith(".internal")) return true;
  // IPv4 literal checks
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  // IPv6 loopback / link-local
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

export function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Only http/https URLs are allowed (got ${u.protocol})`);
  }
  if (isBlockedHost(u.hostname)) {
    throw new Error(`URL host '${u.hostname}' is blocked (private/reserved range)`);
  }
  return u;
}

/** Fetch HTML with timeout + redirect cap + size cap. */
async function fetchHtml(url: URL): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let current = url;
  let redirects = 0;
  try {
    for (;;) {
      const res = await fetch(current, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "manual",
        signal: controller.signal,
      });
      // Manual redirect handling so we can validate each hop.
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
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        throw new Error(`Unsupported content type: ${contentType || "unknown"}`);
      }
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
            throw new Error("Response too large (max 5 MB)");
          }
          chunks.push(value);
        }
      }
      const buf = Buffer.concat(chunks);
      // Decode as UTF-8 (most pages are UTF-8; fall back gracefully).
      const html = buf.toString("utf-8");
      return { html, finalUrl: current.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Cheerio-based fallback extraction when Readability returns empty. */
function cheerioFallback(html: string, url: string): { title: string; content: string } {
  const $ = load(html);
  $("script, style, noscript, iframe, nav, header, footer, aside, form, button, svg").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || url;
  // Prefer semantic main content containers.
  const main =
    $("article").first().text() ||
    $("main").first().text() ||
    $("[role=main]").first().text() ||
    $(".content, .article, .post, .entry-content, #content").first().text() ||
    $("body").text();
  const content = main.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { title, content };
}

/**
 * Fetch a URL and extract its main article content as plain text.
 * @param url       The URL to fetch
 * @param maxChars  Truncate extracted content to this many characters (default 20000)
 */
export async function fetchUrl(url: string, maxChars = 20_000): Promise<FetchedPage> {
  const u = validateUrl(url);
  const { html, finalUrl } = await fetchHtml(u);

  let title = "";
  let content = "";

  // Try Readability (Parser) first.
  try {
    const parsed = await Parser.parse(html, { fallback: false });
    if (parsed && (parsed.content ?? "").trim().length > 200) {
      title = parsed.title ?? "";
      // Parser returns HTML in `content`; strip tags for plain text.
      const $c = load(parsed.content ?? "");
      $c("script, style").remove();
      content = $c.text().replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    }
  } catch {
    // fall through to cheerio
  }

  // Fallback if Readability produced too little.
  if (content.trim().length < 200) {
    const fb = cheerioFallback(html, finalUrl);
    if (fb.content.length > content.length) {
      title = title || fb.title;
      content = fb.content;
    }
  }

  if (!title) title = finalUrl;

  let truncated = false;
  if (content.length > maxChars) {
    content = content.slice(0, maxChars);
    truncated = true;
  }

  return {
    title: title.slice(0, 500),
    url: u.toString(),
    finalUrl,
    content,
    contentLength: content.length,
    truncated,
    fetchedAt: new Date().toISOString(),
  };
}

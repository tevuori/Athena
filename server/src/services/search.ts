// ===== DuckDuckGo HTML search (free, no API key) =====
// Scrapes https://html.duckduckgo.com/html/ (the lite HTML endpoint)
// and parses result blocks with cheerio. Includes a short in-memory cache
// to dedupe repeated queries inside a multi-step Athena tool loop.
//
// No env vars required. Rate-limited by a small cooldown between requests.

import { load } from "cheerio";

export interface SearchResult {
  title: string;
  url: string;
  /** Display URL (DuckDuckGo's pretty form). */
  displayUrl?: string;
  description: string;
  /** Snippet source label, e.g. "Wikipedia" — optional. */
  source?: string;
}

export interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
  /** True when results were served from the in-memory cache. */
  cached: boolean;
}

const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0 Athena/1.0";

const CACHE_TTL_MS = 60_000; // 60s
const cache = new Map<string, { ts: number; results: SearchResult[] }>();
let lastRequestTs = 0;
const MIN_INTERVAL_MS = 800; // gentle rate limit between DDG requests

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve a DuckDuckGo redirect wrapper URL to the real target. */
function resolveUrl(raw: string): string {
  // DDG wraps external links as //duckduckgo.com/l/?uddg=<encoded>&rut=...
  try {
    if (raw.startsWith("//")) raw = "https:" + raw;
    const u = new URL(raw);
    if (u.hostname.includes("duckduckgo.com") && u.pathname === "/l/") {
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    return raw;
  } catch {
    return raw;
  }
}

/**
 * Search DuckDuckGo's HTML endpoint.
 * @param query  Search query string
 * @param count  Max results to return (1-20, default 6)
 * @param region Optional region code (e.g. "us-en", "cz-en"). Defaults to no region.
 */
export async function duckDuckGoSearch(
  query: string,
  opts: { count?: number; region?: string } = {}
): Promise<SearchResponse> {
  const count = Math.max(1, Math.min(20, opts.count ?? 6));
  const key = `${query}::${count}::${opts.region ?? ""}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { query, count: hit.results.length, results: hit.results.slice(0, count), cached: true };
  }

  // Rate-limit: keep ~800ms between DDG requests.
  const sinceLast = Date.now() - lastRequestTs;
  if (sinceLast < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - sinceLast);
  lastRequestTs = Date.now();

  const form = new URLSearchParams();
  form.set("q", query);
  form.set("b", "1"); // bypass browser detection
  if (opts.region) form.set("kl", opts.region);

  const res = await fetch(DDG_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: form.toString(),
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = load(html);
  const results: SearchResult[] = [];

  // DDG lite HTML: each result is a .result or .web-result block.
  // The result link is .result__a, the snippet is .result__snippet,
  // and the display URL is .result__url.
  $(".result, .web-result").each((_, el) => {
    if (results.length >= count) return;
    const $el = $(el);
    const title = $el.find(".result__a").text().trim();
    const href = $el.find(".result__a").attr("href") ?? "";
    const snippet = $el.find(".result__snippet").text().trim();
    const displayUrl = $el.find(".result__url").text().trim();
    if (!title || !href) return;
    const url = resolveUrl(href);
    if (!url || !/^https?:\/\//i.test(url)) return;
    results.push({
      title,
      url,
      displayUrl: displayUrl || undefined,
      description: snippet,
    });
  });

  cache.set(key, { ts: Date.now(), results });
  return { query, count: results.length, results, cached: false };
}

// ===== Web search for Athena =====
// Primary backend: Tavily Search API (https://tavily.com) — designed for AI
// agents, free tier (1,000 API credits/month, no credit card). Requires
// TAVILY_API_KEY. Also supports keyless mode (rate-limited, no key needed).
// Secondary backend: Brave Search API (https://api.search.brave.com) — requires
// BRAVE_SEARCH_API_KEY (free tier discontinued).
// Fallback backend: DuckDuckGo HTML scraper (no API key required).
//
// DuckDuckGo's html.duckduckgo.com/html/ endpoint serves an anti-bot
// "anomaly.js" challenge page (HTTP 202, or a 200 page containing the
// challenge form) to datacenter/server IPs after the first request. Because
// 202 is a 2xx status, a naive `res.ok` check treats it as success and parses
// zero results — the tool silently returns an empty list instead of failing.
// We now detect the challenge explicitly and throw a clear, actionable error
// directing the user to set TAVILY_API_KEY (or BRAVE_SEARCH_API_KEY).

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
  /** Which backend produced these results: "tavily" | "brave" | "duckduckgo". */
  backend: "tavily" | "brave" | "duckduckgo";
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

const CACHE_TTL_MS = 60_000; // 60s
const cache = new Map<string, { ts: number; results: SearchResult[]; backend: SearchResponse["backend"] }>();
let lastRequestTs = 0;
const MIN_INTERVAL_MS = 800; // gentle rate limit between DDG requests

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function braveApiKey(): string | undefined {
  return process.env.BRAVE_SEARCH_API_KEY?.trim() || undefined;
}

function tavilyApiKey(): string | undefined {
  return process.env.TAVILY_API_KEY?.trim() || undefined;
}

/**
 * Map a region code (e.g. "cz-en", "us-en") to a Tavily country name.
 * Tavily uses full country names, not ISO codes. Falls back to undefined
 * (no country boost) for unmapped regions.
 */
function tavilyCountry(region?: string): string | undefined {
  if (!region) return undefined;
  const code = region.slice(0, 2).toLowerCase();
  const map: Record<string, string> = {
    us: "united states", gb: "united kingdom", cz: "czech republic",
    de: "germany", fr: "france", sk: "slovakia", pl: "poland",
    ca: "canada", au: "australia", jp: "japan", cn: "china",
    ru: "russia", it: "italy", es: "spain", nl: "netherlands",
    se: "sweden", no: "norway", dk: "denmark", fi: "finland",
    at: "austria", ch: "switzerland", be: "belgium", ie: "ireland",
    pt: "portugal", gr: "greece", hu: "hungary", ro: "romania",
    bg: "bulgaria", hr: "croatia", si: "slovenia", lt: "lithuania",
    lv: "latvia", ee: "estonia", is: "iceland", lu: "luxembourg",
    mt: "malta", cy: "cyprus",
  };
  return map[code];
}

/**
 * Search via the Tavily Search API. Requires TAVILY_API_KEY.
 * Free tier: 1,000 API credits/month, no credit card.
 * https://app.tavily.com — sign up for a key.
 *
 * Tavily is designed for AI agents: it combines search + content extraction
 * and returns semantically relevant snippets. The "basic" search depth costs
 * 1 credit per request; "advanced" costs 2.
 */
export async function tavilySearch(
  query: string,
  opts: { count?: number; region?: string } = {}
): Promise<SearchResponse> {
  const key = tavilyApiKey();
  const count = Math.max(1, Math.min(20, opts.count ?? 6));

  const body: Record<string, any> = {
    query,
    max_results: count,
    search_depth: "basic",
    topic: "general",
    chunks_per_source: 1, // keep snippets concise — we fetch full pages separately
  };
  if (key) body.api_key = key;
  const country = tavilyCountry(opts.region);
  if (country) body.country = country;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  // Keyless mode: without an API key, Tavily requires the keyless header.
  // Rate-limited but works for light use without registration.
  if (!key) headers["X-Tavily-Access-Mode"] = "keyless";

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Tavily Search API rejected the key (HTTP ${res.status}). Check TAVILY_API_KEY.`
    );
  }
  if (res.status === 429) {
    throw new Error(
      "Tavily Search rate limit reached (free tier: 1,000 credits/month). " +
        "Set BRAVE_SEARCH_API_KEY or wait for the monthly reset."
    );
  }
  if (!res.ok) {
    throw new Error(`Tavily Search failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;
  const rawResults: any[] = data?.results ?? [];
  const results: SearchResult[] = rawResults.slice(0, count).map((r) => ({
    title: String(r.title ?? "").trim(),
    url: String(r.url ?? "").trim(),
    description: String(r.content ?? "").trim(),
  })).filter((r) => r.title && r.url && /^https?:\/\//i.test(r.url));

  return { query, count: results.length, results, cached: false, backend: "tavily" };
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
 * Detect DuckDuckGo's anti-bot challenge page. DDG serves this with HTTP 202
 * (a 2xx status, so `res.ok` is true) or occasionally a 200 containing the
 * challenge form. The markers below are taken verbatim from captured anomaly
 * responses and are specific enough not to false-positive on real snippets.
 */
function isDdgChallengeHtml(html: string): boolean {
  // Markers that only appear in DDG's anomaly-modal HTML.
  return (
    html.includes("/anomaly.js") ||
    html.includes('id="challenge-form"') ||
    html.includes("anomaly-modal__") ||
    html.includes("anomaly_modal") ||
    html.includes("Unfortunately, bots use DuckDuckGo too.")
  );
}

/** Error thrown when DuckDuckGo serves its anti-bot challenge. */
export class DdgBlockedError extends Error {
  constructor() {
    super(
      "DuckDuckGo is blocking this server's IP with an anti-bot challenge. " +
        "Set TAVILY_API_KEY (free tier: 1,000 queries/month, no credit card — " +
        "https://app.tavily.com) or BRAVE_SEARCH_API_KEY for reliable web search."
    );
    this.name = "DdgBlockedError";
  }
}

/**
 * Search via the Brave Search API. Requires BRAVE_SEARCH_API_KEY.
 * Free tier: 2000 queries/month. https://api-dashboard.search.brave.com
 */
export async function braveSearch(
  query: string,
  opts: { count?: number; region?: string } = {}
): Promise<SearchResponse> {
  const key = braveApiKey();
  if (!key) throw new Error("BRAVE_SEARCH_API_KEY is not set.");

  const count = Math.max(1, Math.min(20, opts.count ?? 6));
  const params = new URLSearchParams({ q: query, count: String(count) });
  if (opts.region) params.set("country", opts.region.slice(0, 2).toLowerCase());

  const res = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": key,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Brave Search API rejected the key (HTTP ${res.status}). Check BRAVE_SEARCH_API_KEY.`);
  }
  if (!res.ok) {
    throw new Error(`Brave Search failed: HTTP ${res.status}`);
  }

  const data = await res.json() as any;
  const rawResults: any[] = data?.web?.results ?? [];
  const results: SearchResult[] = rawResults.slice(0, count).map((r) => ({
    title: String(r.title ?? "").trim(),
    url: String(r.url ?? "").trim(),
    description: String(r.description ?? "").trim(),
    source: r.profile?.name || undefined,
  })).filter((r) => r.title && r.url && /^https?:\/\//i.test(r.url));

  return { query, count: results.length, results, cached: false, backend: "brave" };
}

/**
 * Search DuckDuckGo's HTML endpoint (no API key required).
 * Throws DdgBlockedError when DDG serves its anti-bot challenge page.
 * @param query  Search query string
 * @param count  Max results to return (1-20, default 6)
 * @param region Optional region code (e.g. "us-en", "cz-en"). Defaults to no region.
 */
export async function duckDuckGoSearch(
  query: string,
  opts: { count?: number; region?: string } = {}
): Promise<SearchResponse> {
  const count = Math.max(1, Math.min(20, opts.count ?? 6));

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

  // DDG serves the anti-bot challenge as HTTP 202 (a 2xx, so res.ok is true).
  // Don't let it through — detect it explicitly and fail loudly.
  const html = await res.text();
  if (res.status === 202 || isDdgChallengeHtml(html)) {
    throw new DdgBlockedError();
  }
  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
  }

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

  return { query, count: results.length, results, cached: false, backend: "duckduckgo" };
}

/**
 * Unified web search entry point.
 * Backend priority: Tavily (free tier, AI-optimized) → Brave (if key set) →
 * DuckDuckGo (no key required, but may be blocked on datacenter IPs).
 * Tavily also works in keyless mode (rate-limited, no registration) when
 * TAVILY_API_KEY is not set — so it's always tried first.
 * Includes a short in-memory cache to dedupe repeated queries inside a
 * multi-step Athena tool loop.
 */
export async function webSearch(
  query: string,
  opts: { count?: number; region?: string } = {}
): Promise<SearchResponse> {
  const count = Math.max(1, Math.min(20, opts.count ?? 6));
  const key = `${query}::${count}::${opts.region ?? ""}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return {
      query,
      count: hit.results.length,
      results: hit.results.slice(0, count),
      cached: true,
      backend: hit.backend,
    };
  }

  const hasTavily = !!tavilyApiKey();
  const hasBrave = !!braveApiKey();
  const errors: Error[] = [];

  // 1. Prefer Tavily (reliable, AI-optimized, keyless fallback available).
  if (hasTavily || !hasBrave) {
    try {
      const res = await tavilySearch(query, opts);
      cache.set(key, { ts: Date.now(), results: res.results, backend: res.backend });
      return res;
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
      // Fall through to Brave or DDG.
    }
  }

  // 2. Brave Search (if configured).
  if (hasBrave) {
    try {
      const res = await braveSearch(query, opts);
      cache.set(key, { ts: Date.now(), results: res.results, backend: res.backend });
      return res;
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // 3. Fallback: DuckDuckGo (no key required, but may be IP-blocked).
  try {
    const res = await duckDuckGoSearch(query, opts);
    cache.set(key, { ts: Date.now(), results: res.results, backend: res.backend });
    return res;
  } catch (e) {
    const ddgErr = e instanceof Error ? e : new Error(String(e));
    errors.push(ddgErr);
    // Throw the most actionable error. Prefer a non-DDG-blocked error (e.g.
    // Tavily rate limit, Brave key issue) over the DDG block message, since
    // the DDG block is expected when no API key is configured.
    const actionable = errors.find((err) => !(err instanceof DdgBlockedError));
    throw actionable ?? ddgErr;
  }
}

// ===== Athena web search tool =====
// Uses the free DuckDuckGo HTML scraper (no API key required).

import type { ToolDef } from "./plugin";
import { duckDuckGoSearch } from "../../../services/search";

export const searchTools: ToolDef[] = [
  {
    name: "web_search",
    description:
      "Search the web (DuckDuckGo) for current information. Returns titles, URLs, and short snippets. Use this when the user asks about recent events, facts you're unsure of, or anything not in their workspace. For deeper research with full-page fetching and a synthesized cited answer, use the 'research' tool instead.",
    parameters: [
      { name: "query", type: "string", description: "Search query", required: true },
      { name: "count", type: "number", description: "Max results (1-10, default 6)" },
      { name: "region", type: "string", description: "Optional region code (e.g. 'us-en', 'cz-en')" },
    ],
    handler: async (args) => {
      const query = String(args.query ?? "").trim();
      if (!query) return { error: "query is required" };
      const count = Math.max(1, Math.min(10, Number(args.count) || 6));
      try {
        const res = await duckDuckGoSearch(query, {
          count,
          region: args.region ? String(args.region) : undefined,
        });
        return {
          query: res.query,
          count: res.count,
          cached: res.cached,
          results: res.results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.description,
          })),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Search failed" };
      }
    },
  },
];

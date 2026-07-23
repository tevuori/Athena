// ===== Athena URL fetch tool =====
// Fetches a web page and extracts its main article content as plain text.

import type { ToolDef } from "./plugin";
import { fetchUrl } from "../../../services/fetcher";

export const fetchTools: ToolDef[] = [
  {
    name: "fetch_url",
    description:
      "Fetch a web page and extract its main article content as clean text (strips ads/nav/scripts). Use this after web_search to read the full content of a specific result. Returns title, final URL, and the extracted text (truncated to ~20k chars).",
    parameters: [
      { name: "url", type: "string", description: "Full http(s) URL to fetch", required: true },
      { name: "maxChars", type: "number", description: "Max chars to extract (default 20000)" },
    ],
    handler: async (args) => {
      const url = String(args.url ?? "").trim();
      if (!url) return { error: "url is required" };
      const maxChars = Math.max(500, Math.min(50_000, Number(args.maxChars) || 20_000));
      try {
        const page = await fetchUrl(url, maxChars);
        return {
          title: page.title,
          url: page.url,
          finalUrl: page.finalUrl,
          content: page.content,
          contentLength: page.contentLength,
          truncated: page.truncated,
          fetchedAt: page.fetchedAt,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Fetch failed" };
      }
    },
  },
];

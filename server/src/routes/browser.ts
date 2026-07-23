import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
  proxyPage,
  fetchPageText,
  clearBrowserSession,
} from "../services/browser";

const browser = new Hono();
browser.use("*", authMiddleware);

/**
 * GET /api/browser/proxy?url=...
 * Returns a proxied HTML page rewritten for iframe embedding, or passes through
 * non-HTML responses (JSON API calls, etc.) untouched so SPA runtime requests
 * work. Sets X-Final-Url so callers that can read headers know the post-redirect URL.
 */
browser.get("/proxy", async (c) => {
  const { userId } = c.get("auth");
  const url = c.req.query("url");
  if (!url) return c.text("Missing url parameter", 400);
  // Pass the token through to the proxy so the injected interception script
  // can build authenticated proxy URLs for runtime fetch/XHR calls.
  const token = c.req.query("token") ?? undefined;
  try {
    const page = await proxyPage(userId, url, token);
    c.header("X-Final-Url", page.finalUrl);
    if (page.kind === "raw") {
      c.header("Content-Type", page.contentType);
      return c.body(new Uint8Array(page.buffer));
    }
    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(page.html);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proxy error";
    return c.text(`Browser proxy error: ${msg}`, 502);
  }
});

/**
 * GET /api/browser/content?url=...
 * Returns extracted main text of a page (used by Athena's get_browser_content).
 */
browser.get("/content", async (c) => {
  const { userId } = c.get("auth");
  const url = c.req.query("url");
  if (!url) return c.json({ error: "Missing url parameter" }, 400);
  try {
    const page = await fetchPageText(userId, url);
    return c.json(page);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch error";
    return c.json({ error: msg }, 502);
  }
});

/** DELETE /api/browser/cookies — clear the user's browser cookie jar (log out). */
browser.delete("/cookies", (c) => {
  const { userId } = c.get("auth");
  clearBrowserSession(userId);
  return c.json({ ok: true });
});

export default browser;

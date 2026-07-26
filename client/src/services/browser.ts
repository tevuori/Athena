import { api, getToken } from "./api";

export interface BrowserPageText {
  url: string;
  finalUrl: string;
  title: string;
  content: string;
  contentLength: number;
  truncated: boolean;
  error?: string;
}

export const browserApi = {
  /** Build the proxy iframe src for a given URL (auth via ?token= for iframes). */
  proxyUrl: (url: string) => {
    const token = getToken();
    return `/api/browser/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token ?? "")}`;
  },

  /** Fetch extracted main text of a page (used by Athena's get_browser_content). */
  content: (url: string, selector?: string) =>
    api.get<BrowserPageText>(`/api/browser/content?url=${encodeURIComponent(url)}${selector ? `&selector=${encodeURIComponent(selector)}` : ""}`),

  /** Check if a URL is known to be embeddable in an iframe (not in the blocklist). */
  embeddable: (url: string) =>
    api.get<{ embeddable: boolean }>(`/api/browser/embeddable?url=${encodeURIComponent(url)}`),

  /** Clear the user's browser cookie jar (log out / clear session). */
  clearCookies: () => api.delete<{ ok: boolean }>("/api/browser/cookies"),
};

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Read the client package version once at build time. Falls back to "0.0.0"
// if package.json is unreadable (e.g. some sandboxed build envs).
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Auto-detect the GitHub owner/repo from the git remote origin URL.
// e.g. "https://github.com/tevuori/Athena.git" → "tevuori/Athena".
// Override at build time with VITE_UPDATE_REPO=owner/repo if needed.
function detectUpdateRepo(): string | undefined {
  const override = process.env.VITE_UPDATE_REPO;
  if (override) return override;
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    const match = remote.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i);
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    // git not available — leave undefined; updater will no-op on web builds.
  }
  return undefined;
}

const APP_VERSION = readAppVersion();
const UPDATE_REPO = detectUpdateRepo();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __UPDATE_REPO__: JSON.stringify(UPDATE_REPO ?? null),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-32.png", "favicon-16.png", "apple-touch-icon.png"],
      manifest: {
        name: "Athena — Student OS",
        short_name: "Athena",
        description: "A desktop-environment-style productivity dashboard for students.",
        theme_color: "#6366f1",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Don't precache the API — always fetch fresh.
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2,ttf}"],
        // Clean up old caches.
        cleanupOutdatedCaches: true,
        // The main JS bundle is ~3MB; allow precaching up to 4MB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import auth from "./routes/auth";
import notes from "./routes/notes";
import tasks from "./routes/tasks";
import taskWorkspaces from "./routes/task-workspaces";
import files from "./routes/files";
import spotify from "./routes/spotify";
import lyrics from "./routes/lyrics";
import flashcards from "./routes/flashcards";
import grades from "./routes/grades";
import vut from "./routes/vut";
import ai from "./routes/ai";
import athena from "./routes/athena";
import conversations from "./routes/conversations";
import study from "./routes/study";
import studySources from "./routes/study-sources";
import studyChat from "./routes/study-chat";
import studyPodcasts from "./routes/study-podcasts";
import studyWorkspaces from "./routes/study-workspaces";
import moodle from "./routes/moodle";
import calendar from "./routes/calendar";
import habits from "./routes/habits";
import whiteboards from "./routes/whiteboards";
import capture from "./routes/capture";
import microsoft, { msOAuthCallback } from "./routes/microsoft";
import users from "./routes/users";
import ntfy from "./routes/ntfy";
import voice from "./routes/voice";
import links from "./routes/links";
import proactiveAlerts from "./routes/proactive-alerts";
import browser from "./routes/browser";
import teacher from "./routes/teacher";
import tts from "./routes/tts";
import reminders from "./routes/reminders";
import analytics from "./routes/analytics";
import studyLectures from "./routes/study-lectures";
import { analyticsMiddleware, startAnalyticsFlusher } from "./services/analytics";
import { startScheduler } from "./services/ntfy/scheduler";
import { startAllSubscribers } from "./services/ntfy/subscriber";
import { startProactiveScheduler } from "./services/ntfy/proactive-scheduler";
import { startReminderScheduler } from "./services/reminders/scheduler";

const app = new Hono();

// Global error handler — returns JSON (not Hono's default plain-text "Internal
// Server Error") so the client's JSON.parse never fails on unhandled errors.
app.onError((err, c) => {
  console.error("[athena-server] Unhandled error:", err);
  const message =
    err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: message }, 500);
});

app.use("*", logger());
// CORS: restrict to the configured client origin(s) for public deployments.
// CLIENT_ORIGIN may be a single origin or a comma-separated list. When unset
// (local dev), fall back to reflecting the request origin so dev still works.
// The Capacitor native app always originates from https://localhost (or
// capacitor://localhost on some configs) — we allow these unconditionally
// so the APK can talk to the server without extra config.
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CAPACITOR_ORIGINS = ["https://localhost", "http://localhost", "capacitor://localhost"];
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (allowedOrigins.length === 0) return origin ?? "*";
      if (origin && allowedOrigins.includes(origin)) return origin;
      if (origin && CAPACITOR_ORIGINS.includes(origin)) return origin;
      return null; // reject non-allowed origins
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);
// Anonymous per-feature usage counter (in-memory, flushed every 30s).
// Runs after CORS so only allowed-origin requests are counted. Skips
// OPTIONS preflight and auth/analytics routes itself.
app.use("*", analyticsMiddleware);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "athena-server",
    version: "0.1.0",
    // Spotify is now per-user; report whether the server-wide env fallback exists.
    spotifyEnvFallback: Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REFRESH_TOKEN
    ),
  })
);

// Public Microsoft OAuth2 callback — mounted at the root (not under /api/microsoft)
// so it bypasses the auth middleware. The redirect URI registered in Azure must
// match: https://<your-domain>/auth/callback (configurable via MS_REDIRECT_URI).
app.get("/auth/callback", msOAuthCallback);

app.route("/api/auth", auth);
app.route("/api/notes", notes);
app.route("/api/tasks", tasks);
app.route("/api/task-workspaces", taskWorkspaces);
app.route("/api/files", files);
app.route("/api/spotify", spotify);
app.route("/api/lyrics", lyrics);
app.route("/api/flashcards", flashcards);
app.route("/api/grades", grades);
app.route("/api/vut", vut);
app.route("/api/ai", ai);
app.route("/api/athena", athena);
app.route("/api/conversations", conversations);
app.route("/api/study", study);
app.route("/api/study/sources", studySources);
app.route("/api/study/chat", studyChat);
app.route("/api/study/podcasts", studyPodcasts);
app.route("/api/study/workspaces", studyWorkspaces);
app.route("/api/study/lectures", studyLectures);
app.route("/api/moodle", moodle);
app.route("/api/calendar", calendar);
app.route("/api/habits", habits);
app.route("/api/whiteboards", whiteboards);
app.route("/api/capture", capture);
app.route("/api/microsoft", microsoft);
app.route("/api/users", users);
app.route("/api/ntfy", ntfy);
app.route("/api/voice", voice);
app.route("/api/links", links);
app.route("/api/proactive-alerts", proactiveAlerts);
app.route("/api/browser", browser);
app.route("/api/teacher", teacher);
app.route("/api/tts", tts);
app.route("/api/reminders", reminders);
app.route("/api/analytics", analytics);

// Start ntfy background workers (cron scheduler + per-user inbox subscribers).
startScheduler();
startAllSubscribers().catch((e) =>
  console.error("[athena-server] ntfy subscriber startup error:", e)
);
// Start the proactive daily-briefing scheduler.
startProactiveScheduler();
// Start the one-shot reminder scheduler.
startReminderScheduler();
// Start the anonymous usage-analytics flusher (writes buffered hits to DB every 30s).
startAnalyticsFlusher();

const port = Number(process.env.SERVER_PORT ?? 3000);
const hostname = process.env.SERVER_HOST ?? "0.0.0.0";

// Bun-native serve pattern: export default { port, fetch }.
// idleTimeout is in seconds — default 10s kills SSE streams mid-tool-loop.
// Set to 300s (5 min) so Athena chat streams with multi-step tool calls survive.
// maxRequestBodySize raised to 2 GB to support lecture video uploads.
console.log(`[athena-server] Bun serving on http://${hostname}:${port}`);
export default {
  port,
  hostname,
  idleTimeout: 255,
  maxRequestBodySize: 2 * 1024 * 1024 * 1024, // 2 GB
  fetch: app.fetch,
};

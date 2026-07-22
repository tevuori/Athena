import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import auth from "./routes/auth";
import notes from "./routes/notes";
import tasks from "./routes/tasks";
import files from "./routes/files";
import spotify from "./routes/spotify";
import lyrics from "./routes/lyrics";
import flashcards from "./routes/flashcards";
import grades from "./routes/grades";
import vut from "./routes/vut";
import ai from "./routes/ai";
import athena from "./routes/athena";
import { isSpotifyConfigured } from "./services/spotify";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "athena-server",
    version: "0.1.0",
    spotifyConfigured: isSpotifyConfigured(),
  })
);

app.route("/api/auth", auth);
app.route("/api/notes", notes);
app.route("/api/tasks", tasks);
app.route("/api/files", files);
app.route("/api/spotify", spotify);
app.route("/api/lyrics", lyrics);
app.route("/api/flashcards", flashcards);
app.route("/api/grades", grades);
app.route("/api/vut", vut);
app.route("/api/ai", ai);
app.route("/api/athena", athena);

const port = Number(process.env.SERVER_PORT ?? 3000);
const hostname = process.env.SERVER_HOST ?? "0.0.0.0";

// Bun-native serve pattern: export default { port, fetch }.
// idleTimeout is in seconds — default 10s kills SSE streams mid-tool-loop.
// Set to 300s (5 min) so Athena chat streams with multi-step tool calls survive.
console.log(`[athena-server] Bun serving on http://${hostname}:${port}`);
export default {
  port,
  hostname,
  idleTimeout: 255,
  fetch: app.fetch,
};

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { getLyrics, searchLyrics } from "../services/lrclib";
import { optionalAuth, authMiddleware } from "../middleware/auth";

const lyrics = new Hono();

/** GET /lyrics/get — exact match, with DB cache by trackId. */
lyrics.get("/get", async (c) => {
  const track_name = c.req.query("track_name");
  const artist_name = c.req.query("artist_name");
  const album_name = c.req.query("album_name") ?? "";
  const durationStr = c.req.query("duration");
  const duration = durationStr ? Number(durationStr) : undefined;
  const track_id = c.req.query("track_id");

  if (!track_name || !artist_name) {
    return c.json({ error: "track_name and artist_name required" }, 400);
  }
  const body = { track_name, artist_name, album_name, duration, track_id };
  const trackId = track_id ?? `${track_name}|${artist_name}`;

  // Check cache
  const cached = await prisma.lyricsCache.findUnique({ where: { trackId } });
  if (cached) {
    return c.json({
      cached: true,
      result: {
        trackName: cached.trackName,
        artistName: cached.artistName,
        albumName: cached.albumName,
        duration: cached.duration,
        syncedLyrics: cached.syncedLyrics,
        plainLyrics: cached.plainLyrics,
        instrumental: cached.instrumental,
      },
    });
  }

  try {
    const result = await getLyrics({
      track_name: body.track_name,
      artist_name: body.artist_name,
      album_name: body.album_name || undefined,
      duration: body.duration,
    });

    if (!result) {
      // Cache the "not found" as an empty record to avoid repeated 404s? We'll
      // cache only positive results; return 404 to client so it can fall back.
      return c.json({ error: "No lyrics found", result: null }, 404);
    }

    // Persist to cache
    await prisma.lyricsCache.upsert({
      where: { trackId },
      create: {
        trackId,
        trackName: result.trackName,
        artistName: result.artistName,
        albumName: result.albumName,
        duration: result.duration,
        syncedLyrics: result.syncedLyrics,
        plainLyrics: result.plainLyrics,
        instrumental: result.instrumental,
      },
      update: {
        trackName: result.trackName,
        artistName: result.artistName,
        albumName: result.albumName,
        duration: result.duration,
        syncedLyrics: result.syncedLyrics,
        plainLyrics: result.plainLyrics,
        instrumental: result.instrumental,
        fetchedAt: new Date(),
      },
    });

    return c.json({ cached: false, result });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** GET /lyrics/search?q= — fuzzy search for fallback selection. */
lyrics.get("/search", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: "q required" }, 400);
  try {
    const results = await searchLyrics(q);
    return c.json({ results });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** POST /lyrics/cache/:trackId — manually cache a chosen search result. */
lyrics.post("/cache/:trackId", authMiddleware, zValidator("json", z.object({
  trackName: z.string(),
  artistName: z.string(),
  albumName: z.string().default(""),
  duration: z.number().default(0),
  syncedLyrics: z.string().default(""),
  plainLyrics: z.string().default(""),
  instrumental: z.boolean().default(false),
})), async (c) => {
  const { userId } = c.get("auth");
  const trackId = c.req.param("trackId");
  const body = c.req.valid("json");
  const record = await prisma.lyricsCache.upsert({
    where: { trackId },
    create: { ...body, trackId, userId },
    update: { ...body, userId, fetchedAt: new Date() },
  });
  return c.json({ record });
});

/** GET /lyrics/parse — parse raw LRC into timed lines (utility for client). */
lyrics.get("/parse", optionalAuth, async (c) => {
  const lrc = c.req.query("lrc") ?? "";
  // Reuse the parser via a dynamic import to avoid duplicating logic.
  const { parseLrc } = await import("../services/lrclib");
  return c.json({ lines: parseLrc(decodeURIComponent(lrc)) });
});

export default lyrics;

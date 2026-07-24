// ===== TTS route (Edge TTS primary + ElevenLabs optional premium) =====
// POST /synthesize         — synthesize text → audio/mpeg
// POST /synthesize/timed   — synthesize with word boundaries / timestamps
// GET  /config             — check if TTS is configured + provider info
// PUT  /credential         — save ElevenLabs API key (encrypted, optional)
// DELETE /credential       — remove stored ElevenLabs credential

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { encryptSecret } from "../services/crypto";
import {
  getTtsConfig,
  resolveTtsProvider,
  synthesize,
  synthesizeTimed,
} from "../services/tts";

const tts = new Hono();
tts.use("*", authMiddleware);

// ---------- config ----------

tts.get("/config", async (c) => {
  const { userId } = c.get("auth");
  const provider = await resolveTtsProvider(userId);
  const cfg = await getTtsConfig(userId);
  return c.json({
    configured: true, // Edge TTS is always available
    hasUserKey: Boolean(await prisma.ttsCredential.findUnique({ where: { userId } })),
    provider,
    // ElevenLabs config (if set)
    voiceId: cfg.voiceId,
    modelId: cfg.modelId,
    // Edge TTS is always available
    edgeAvailable: true,
  });
});

// ---------- credential CRUD (ElevenLabs — optional premium) ----------

const credSchema = z.object({
  apiKey: z.string().min(1).max(500),
  voiceId: z.string().max(100).optional(),
  modelId: z.string().max(100).optional(),
});

tts.put("/credential", zValidator("json", credSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const apiKeyEnc = encryptSecret(body.apiKey);
  const data = {
    apiKeyEnc,
    voiceId: body.voiceId?.trim() || null,
    modelId: body.modelId?.trim() || null,
  };
  const cred = await prisma.ttsCredential.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  return c.json({ ok: true, id: cred.id });
});

tts.delete("/credential", async (c) => {
  const { userId } = c.get("auth");
  await prisma.ttsCredential.deleteMany({ where: { userId } });
  return c.json({ ok: true });
});

// ---------- synthesis ----------

const synthSchema = z.object({
  text: z.string().min(1).max(5000),
  language: z.enum(["en", "cs"]).optional().default("en"),
  voice: z.string().max(100).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

/** POST /synthesize — returns audio/mpeg bytes. */
tts.post("/synthesize", zValidator("json", synthSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  try {
    const result = await synthesize(userId, body.text, {
      language: body.language,
      voice: body.voice,
      stability: body.stability,
      similarityBoost: body.similarityBoost,
      speed: body.speed,
    });
    return new Response(result.audio, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.audio.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    return c.json({ error: e instanceof Error ? e.message : "TTS failed" }, status as 400 | 401 | 403 | 429 | 500);
  }
});

/** POST /synthesize/timed — returns JSON { audio_base64, wordBoundaries?, alignment? }.
 *  The client uses wordBoundaries (Edge TTS) or alignment (ElevenLabs) for
 *  speech-synced highlighting. */
tts.post("/synthesize/timed", zValidator("json", synthSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  try {
    const result = await synthesizeTimed(userId, body.text, {
      language: body.language,
      voice: body.voice,
      stability: body.stability,
      similarityBoost: body.similarityBoost,
      speed: body.speed,
    });
    return c.json({
      audio_base64: result.audio.toString("base64"),
      contentType: result.contentType,
      wordBoundaries: result.wordBoundaries,
      alignment: result.alignment,
      provider: result.provider,
    });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    return c.json({ error: e instanceof Error ? e.message : "TTS failed" }, status as 400 | 401 | 403 | 429 | 500);
  }
});

export default tts;

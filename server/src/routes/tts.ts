// ===== TTS route (ElevenLabs synthesis + credential CRUD) =====
// POST /synthesize         — synthesize text → audio/mpeg
// POST /synthesize/timed   — synthesize with character-level timestamps
// GET  /config             — check if TTS is configured (no key returned)
// PUT  /credential         — save ElevenLabs API key (encrypted)
// DELETE /credential       — remove stored credential

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { encryptSecret } from "../services/crypto";
import {
  getTtsConfig,
  isTtsConfiguredFor,
  synthesizeSpeech,
  synthesizeSpeechWithTimestamps,
} from "../services/tts";

const tts = new Hono();
tts.use("*", authMiddleware);

// ---------- config ----------

tts.get("/config", async (c) => {
  const { userId } = c.get("auth");
  const configured = await isTtsConfiguredFor(userId);
  const cfg = await getTtsConfig(userId);
  return c.json({
    configured,
    hasUserKey: Boolean(await prisma.ttsCredential.findUnique({ where: { userId } })),
    voiceId: cfg.voiceId,
    modelId: cfg.modelId,
    provider: "elevenlabs",
  });
});

// ---------- credential CRUD ----------

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
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.5).max(2).optional(),
});

/** POST /synthesize — returns audio/mpeg bytes. */
tts.post("/synthesize", zValidator("json", synthSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const cfg = await getTtsConfig(userId);
  if (!cfg.apiKey) {
    return c.json({ error: "No TTS provider configured. Add an ElevenLabs API key in Settings or set ELEVENLABS_API_KEY." }, 400);
  }
  try {
    const result = await synthesizeSpeech(cfg, body.text, {
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

/** POST /synthesize/timed — returns JSON { audio_base64, alignment }.
 *  The client uses alignment for speech-synced highlighting. */
tts.post("/synthesize/timed", zValidator("json", synthSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const cfg = await getTtsConfig(userId);
  if (!cfg.apiKey) {
    return c.json({ error: "No TTS provider configured." }, 400);
  }
  try {
    const result = await synthesizeSpeechWithTimestamps(cfg, body.text, {
      stability: body.stability,
      similarityBoost: body.similarityBoost,
      speed: body.speed,
    });
    return c.json({
      audio_base64: result.audio.toString("base64"),
      contentType: result.contentType,
      alignment: result.alignment,
    });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    return c.json({ error: e instanceof Error ? e.message : "TTS failed" }, status as 400 | 401 | 403 | 429 | 500);
  }
});

export default tts;

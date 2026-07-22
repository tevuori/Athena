import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { encryptSecret, decryptSecret } from "../services/crypto";
import { isLlmConfiguredFor } from "../services/athena/llm";

const ai = new Hono();
ai.use("*", authMiddleware);

// ---------- API key management ----------

const keySchema = z.object({
  apiKey: z.string().min(1).max(512),
  provider: z.string().max(64).optional(), // multi-llm-ts engine id
  baseUrl: z.string().url().max(512).optional().or(z.literal("")),
  modelId: z.string().max(128).optional().or(z.literal("")),
});

function decryptSafe(enc: string): string | null {
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

/** GET /api/ai/key — reports whether a key is set (never returns the secret). */
ai.get("/key", async (c) => {
  const { userId } = c.get("auth");
  const cred = await prisma.aiCredential.findUnique({ where: { userId } });
  return c.json({
    hasKey: Boolean(cred),
    provider: cred?.provider ?? "openai",
    baseUrl: cred?.baseUrl ?? "",
    modelId: cred?.modelId ?? "",
    configured: await isLlmConfiguredFor(userId),
  });
});

/** PUT /api/ai/key — store (or replace) the user's encrypted API key + provider config. */
ai.put("/key", zValidator("json", keySchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const enc = encryptSecret(body.apiKey.trim());
  const provider = body.provider?.trim() || "openai";
  const baseUrl = body.baseUrl?.trim() || null;
  const modelId = body.modelId?.trim() || null;
  const cred = await prisma.aiCredential.upsert({
    where: { userId },
    create: { userId, apiKeyEnc: enc, provider, baseUrl, modelId },
    update: { apiKeyEnc: enc, provider, baseUrl, modelId },
  });
  return c.json({ ok: true, provider: cred.provider });
});

/** DELETE /api/ai/key — remove the user's stored key. */
ai.delete("/key", async (c) => {
  const { userId } = c.get("auth");
  try {
    await prisma.aiCredential.delete({ where: { userId } });
  } catch {
    // already absent
  }
  return c.json({ ok: true });
});

export default ai;

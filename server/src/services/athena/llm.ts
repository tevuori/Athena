// ===== Athena LLM client (multi-llm-ts) =====
// Unified LLM access via https://github.com/nbonamy/multi-llm-ts
//
// Per-user config (encrypted in DB, AiCredential) takes priority over the
// server-wide fallback env vars below. If neither is configured, the LLM
// is unavailable — the user must provide their own API key.
//
// Env vars (server-wide fallback, all optional):
//   OPENAI_PROVIDER   — multi-llm-ts engine id (default "openai")
//   OPENAI_API_KEY    — Bearer token
//   OPENAI_BASE_URL   — base URL (optional, for OpenAI-compatible endpoints)
//   OPENAI_MODEL      — model id (optional)

import {
  igniteModel,
  type LlmModel,
  type EngineCreateOpts,
  type ChatModel,
} from "multi-llm-ts";
import prisma from "../../db/client";
import { decryptSecret } from "../crypto";
import { llmRateLimiter } from "./rate-limiter";

export interface LlmUserConfig {
  /** multi-llm-ts engine id: "openai" | "deepseek" | "anthropic" | "openrouter" | "ollama" | ... */
  provider: string;
  apiKey: string;
  baseURL?: string;
  modelId: string;
}

export interface RateLimitConfig {
  enabled: boolean;
  rpd: number; // requests per day
  rpm: number; // requests per minute
}

export interface FallbackLlmConfig {
  provider: string;
  apiKey: string;
  baseURL?: string;
  modelId: string;
}

/** Result of acquireLlmModel — includes the model to use + rate limit metadata. */
export interface AcquiredModel {
  model: LlmModel;
  /** True if the primary model was rate-limited and the fallback was used. */
  usingFallback: boolean;
  /** Current rate limit status (null if rate limiting is disabled). */
  rateLimit: {
    allowed: boolean;
    dayCount: number;
    minuteCount: number;
    dayLimit: number;
    minuteLimit: number;
  } | null;
}

const SERVER_KEY = process.env.OPENAI_API_KEY ?? "";
const SERVER_BASE_URL = process.env.OPENAI_BASE_URL ?? "";
const SERVER_MODEL = process.env.OPENAI_MODEL ?? "";
const SERVER_PROVIDER = process.env.OPENAI_PROVIDER ?? "openai";

export class LlmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function decryptSafe(enc: string): string | null {
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

/** Resolve the user's LLM config: per-user (DB) wins, server fallback otherwise.
 * Returns apiKey="" if neither is configured — callers should check isLlmConfiguredFor(). */
export async function getUserConfig(userId: string): Promise<LlmUserConfig> {
  const cred = await prisma.aiCredential.findUnique({ where: { userId } });
  if (cred) {
    const apiKey = decryptSafe(cred.apiKeyEnc);
    if (apiKey && apiKey.trim()) {
      return {
        provider: cred.provider?.trim() || "openai",
        apiKey: apiKey.trim(),
        baseURL: cred.baseUrl?.trim() || undefined,
        modelId: cred.modelId?.trim() || SERVER_MODEL || "gpt-4o-mini",
      };
    }
  }
  // Server-wide env fallback (optional — may be empty)
  if (SERVER_KEY) {
    return {
      provider: SERVER_PROVIDER,
      apiKey: SERVER_KEY,
      baseURL: SERVER_BASE_URL || undefined,
      modelId: SERVER_MODEL || "gpt-4o-mini",
    };
  }
  // No config at all — LLM unavailable
  return {
    provider: SERVER_PROVIDER,
    apiKey: "",
    baseURL: undefined,
    modelId: "",
  };
}

/** Returns true if at least one key source is configured. */
export async function isLlmConfiguredFor(userId: string): Promise<boolean> {
  const cfg = await getUserConfig(userId);
  return Boolean(cfg.apiKey);
}

/** Build a fresh LlmModel for a request. Cheap — no network call (loadModels skipped). */
export function buildModel(cfg: LlmUserConfig): LlmModel {
  const config: EngineCreateOpts = { apiKey: cfg.apiKey };
  if (cfg.baseURL) config.baseURL = cfg.baseURL;
  // requestCooldown avoids rate-limit hits during multi-step tool loops.
  config.requestCooldown = 1500;
  // Pass an explicit ChatModel with tools enabled so tool calling works
  // regardless of how the provider names the model (the OpenAI engine infers
  // capabilities from the model id, which is unreliable for custom endpoints).
  const chatModel: ChatModel = {
    id: cfg.modelId,
    name: cfg.modelId,
    capabilities: { tools: true, vision: false, reasoning: false, caching: false },
  };
  return igniteModel(cfg.provider, chatModel, config);
}

/** Get the user's rate limit config from DB (or null if not configured). */
export async function getRateLimitConfig(userId: string): Promise<RateLimitConfig | null> {
  const cred = await prisma.aiCredential.findUnique({ where: { userId } });
  if (!cred || !cred.rateLimitEnabled) return null;
  return {
    enabled: cred.rateLimitEnabled,
    rpd: cred.rateLimitRpd,
    rpm: cred.rateLimitRpm,
  };
}

/** Get the user's fallback LLM config from DB (or null if not configured). */
export async function getFallbackConfig(userId: string): Promise<FallbackLlmConfig | null> {
  const cred = await prisma.aiCredential.findUnique({ where: { userId } });
  if (!cred || !cred.fallbackApiKeyEnc) return null;
  const apiKey = decryptSafe(cred.fallbackApiKeyEnc);
  if (!apiKey || !apiKey.trim()) return null;
  return {
    provider: cred.fallbackProvider?.trim() || "openai",
    apiKey: apiKey.trim(),
    baseURL: cred.fallbackBaseUrl?.trim() || undefined,
    modelId: cred.fallbackModelId?.trim() || "gpt-4o-mini",
  };
}

/**
 * Acquire an LLM model for a request, respecting rate limits.
 *
 * - If rate limiting is disabled (or no AiCredential), returns the primary model.
 * - If rate limiting is enabled and the primary model would exceed limits:
 *   - If a fallback is configured, returns the fallback model.
 *   - If no fallback, throws an LlmError(429, ...).
 * - Records the request in the rate limiter after a successful check.
 *
 * Use this instead of `getUserConfig + buildModel` for all LLM requests.
 */
export async function acquireLlmModel(userId: string): Promise<AcquiredModel> {
  const cfg = await getUserConfig(userId);
  const rateLimitCfg = await getRateLimitConfig(userId);

  // No rate limiting — just return the primary model.
  if (!rateLimitCfg || !rateLimitCfg.enabled) {
    return {
      model: buildModel(cfg),
      usingFallback: false,
      rateLimit: null,
    };
  }

  // Check rate limits for the primary model.
  const status = llmRateLimiter.check(userId, rateLimitCfg.rpd, rateLimitCfg.rpm);

  if (status.allowed) {
    // Primary model is available — record the request and return it.
    llmRateLimiter.record(userId);
    return {
      model: buildModel(cfg),
      usingFallback: false,
      rateLimit: status,
    };
  }

  // Primary model is rate-limited — try fallback.
  const fallback = await getFallbackConfig(userId);
  if (fallback) {
    return {
      model: buildModel(fallback),
      usingFallback: true,
      rateLimit: status,
    };
  }

  // No fallback — reject the request.
  throw new LlmError(
    429,
    `Rate limit reached: ${status.dayCount}/${status.dayLimit} requests today, ${status.minuteCount}/${status.minuteLimit} per minute. Configure a fallback model in Settings → AI to continue when limits are hit.`
  );
}

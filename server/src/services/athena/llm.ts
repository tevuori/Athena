// ===== Athena LLM client (multi-llm-ts) =====
// Unified LLM access via https://github.com/nbonamy/multi-llm-ts
// Default: OpenCode Zen (OpenAI-compatible) → DeepSeek V4 Flash Free.
//
// Per-user config (encrypted in DB, AiCredential) takes priority over the
// server-wide fallback env vars below.
//
// Env vars (server-wide fallback):
//   OPENAI_PROVIDER   — multi-llm-ts engine id (default "openai")
//   OPENAI_API_KEY    — Bearer token
//   OPENAI_BASE_URL   — base URL (default https://opencode.ai/zen/v1)
//   OPENAI_MODEL      — model id (default deepseek-v4-flash-free)

import {
  igniteModel,
  type LlmModel,
  type EngineCreateOpts,
  type ChatModel,
} from "multi-llm-ts";
import prisma from "../../db/client";
import { decryptSecret } from "../crypto";

export interface LlmUserConfig {
  /** multi-llm-ts engine id: "openai" | "deepseek" | "anthropic" | "openrouter" | "ollama" | ... */
  provider: string;
  apiKey: string;
  baseURL?: string;
  modelId: string;
}

const SERVER_KEY = process.env.OPENAI_API_KEY ?? "";
const SERVER_BASE_URL =
  process.env.OPENAI_BASE_URL ?? "https://opencode.ai/zen/v1";
const SERVER_MODEL = process.env.OPENAI_MODEL ?? "deepseek-v4-flash-free";
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

/** Resolve the user's LLM config: per-user (DB) wins, server fallback otherwise. */
export async function getUserConfig(userId: string): Promise<LlmUserConfig> {
  const cred = await prisma.aiCredential.findUnique({ where: { userId } });
  if (cred) {
    const apiKey = decryptSafe(cred.apiKeyEnc);
    if (apiKey && apiKey.trim()) {
      return {
        provider: cred.provider?.trim() || "openai",
        apiKey: apiKey.trim(),
        baseURL: cred.baseUrl?.trim() || undefined,
        modelId: cred.modelId?.trim() || SERVER_MODEL,
      };
    }
  }
  return {
    provider: SERVER_PROVIDER,
    apiKey: SERVER_KEY,
    baseURL: SERVER_BASE_URL,
    modelId: SERVER_MODEL,
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

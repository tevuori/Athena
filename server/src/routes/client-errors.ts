import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { optionalAuth } from "../middleware/auth";
import { logClientErrors } from "../services/error-log";

/**
 * Client error reporting endpoint.
 *
 * Receives error reports from the browser (React error boundary catches,
 * window.onerror, unhandledrejection) and persists them to the ErrorLog table
 * so admins can monitor outages from Settings → Error Logs.
 */

const errorReportSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10000).optional(),
  source: z.string().max(500).optional(),
  lineno: z.number().optional(),
  colno: z.number().optional(),
  url: z.string().max(2000),
  userAgent: z.string().max(500),
  userId: z.string().optional(),
  componentStack: z.string().max(10000).optional(),
  timestamp: z.string(),
});

const batchSchema = z.object({
  errors: z.array(errorReportSchema).max(50),
});

const clientErrors = new Hono();

// Use optional auth so errors can be reported even if the token expired
// (e.g. a crash during login). If authenticated, we have the real userId.
clientErrors.use("*", optionalAuth);

/** POST /api/client-errors — receive a batch of client error reports. */
clientErrors.post("/", zValidator("json", batchSchema), async (c) => {
  const { errors } = c.req.valid("json");
  const authUserId = c.get("auth")?.userId;

  // Persist to DB (also logs to console for docker logs tail).
  await logClientErrors(errors, authUserId);

  // Still log to console for immediate visibility in docker logs.
  for (const err of errors) {
    const userId = err.userId ?? authUserId ?? "anonymous";
    console.error(
      `[client-error] ${err.timestamp} user=${userId} url=${err.url}`,
      `\n  message: ${err.message}`,
      err.source ? `\n  source: ${err.source}:${err.lineno ?? ""}:${err.colno ?? ""}` : "",
      err.componentStack ? `\n  componentStack: ${err.componentStack.slice(0, 500)}` : "",
      err.stack ? `\n  stack: ${err.stack.slice(0, 1000)}` : "",
      `\n  userAgent: ${err.userAgent}`,
    );
  }

  return c.json({ ok: true, received: errors.length });
});

export default clientErrors;

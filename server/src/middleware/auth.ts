import type { Context, Next } from "hono";
import { verifyToken } from "../services/jwt";

export interface AuthVars {
  userId: string;
  username: string;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthVars;
  }
}

/** Extracts Bearer token (from header or ?token= query param), verifies JWT, attaches `c.set("auth", {...})`. */
export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : null;
  // Fallback: ?token= query parameter (for iframe/img contexts that can't set headers)
  if (!token) {
    token = c.req.query("token") ?? null;
  }
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("auth", { userId: payload.sub, username: payload.username });
  await next();
}

/** Optional auth: attaches auth if a valid token is present, but never blocks. */
export async function optionalAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      c.set("auth", { userId: payload.sub, username: payload.username });
    }
  }
  await next();
}

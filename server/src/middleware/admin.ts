import type { Context, Next } from "hono";
import prisma from "../db/client";
import { authMiddleware } from "./auth";

/** Must be used AFTER authMiddleware. Loads the user and 403s if not an admin. */
export async function adminMiddleware(c: Context, next: Next) {
  const { userId } = c.get("auth");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || user.role !== "ADMIN") {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}

/** Convenience: chain auth + admin for a route group. */
export const adminGuard = [authMiddleware, adminMiddleware] as const;

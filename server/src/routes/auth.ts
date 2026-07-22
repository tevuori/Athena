import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcryptjs";
import prisma from "../db/client";
import { signToken } from "../services/jwt";
import { authMiddleware } from "../middleware/auth";

const auth = new Hono();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(4).max(128),
  displayName: z.string().max(64).optional().default(""),
});

/** POST /auth/login */
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid username or password" }, 401);
  }
  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
    },
  });
});

/** POST /auth/register — only allowed if no users exist yet (bootstrap), or always for dev. */
auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { username, password, displayName } = c.req.valid("json");
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, displayName },
  });
  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
    },
  });
});

/** GET /auth/me */
auth.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
  });
});

export default auth;

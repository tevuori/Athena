import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcryptjs";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { adminMiddleware } from "../middleware/admin";

const users = new Hono();
users.use("*", authMiddleware, adminMiddleware);

function publicUser(u: {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  role: string;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

/** GET /api/users — list all users (admin). */
users.get("/", async (c) => {
  const list = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarColor: true,
      role: true,
      createdAt: true,
    },
  });
  return c.json(list.map(publicUser));
});

const createSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(4).max(128),
  displayName: z.string().max(64).optional().default(""),
  avatarColor: z.string().max(32).optional(),
  role: z.enum(["USER", "ADMIN"]).optional().default("USER"),
});

/** POST /api/users — create a new user (admin). */
users.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const existing = await prisma.user.findUnique({ where: { username: body.username } });
  if (existing) return c.json({ error: "Username already taken" }, 409);
  const user = await prisma.user.create({
    data: {
      username: body.username,
      passwordHash: await bcrypt.hash(body.password, 10),
      displayName: body.displayName,
      avatarColor: body.avatarColor ?? "#6366f1",
      role: body.role,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarColor: true,
      role: true,
      createdAt: true,
    },
  });
  return c.json(publicUser(user), 201);
});

const updateSchema = z.object({
  displayName: z.string().max(64).optional(),
  avatarColor: z.string().max(32).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

/** PATCH /api/users/:id — update profile / role (admin). */
users.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const { userId } = c.get("auth");
  const targetId = c.req.param("id");
  const body = c.req.valid("json");

  // Prevent self-demotion to avoid locking yourself out of admin.
  if (targetId === userId && body.role === "USER") {
    return c.json({ error: "You cannot demote yourself. Ask another admin." }, 400);
  }

  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) return c.json({ error: "User not found" }, 404);

  const data: Record<string, string> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.avatarColor !== undefined) data.avatarColor = body.avatarColor;
  if (body.role !== undefined) data.role = body.role;

  const user = await prisma.user.update({
    where: { id: targetId },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarColor: true,
      role: true,
      createdAt: true,
    },
  });
  return c.json(publicUser(user));
});

const resetSchema = z.object({
  password: z.string().min(4).max(128),
});

/** POST /api/users/:id/reset-password — set a new password (admin). */
users.post("/:id/reset-password", zValidator("json", resetSchema), async (c) => {
  const targetId = c.req.param("id");
  const { password } = c.req.valid("json");
  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) return c.json({ error: "User not found" }, 404);
  await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  return c.json({ ok: true });
});

/** DELETE /api/users/:id — delete a user (admin). Blocks self-delete. */
users.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const targetId = c.req.param("id");
  if (targetId === userId) {
    return c.json({ error: "You cannot delete your own account here. Use Account settings." }, 400);
  }
  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) return c.json({ error: "User not found" }, 404);
  await prisma.user.delete({ where: { id: targetId } });
  return c.json({ ok: true });
});

export default users;

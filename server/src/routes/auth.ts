import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcryptjs";
import prisma from "../db/client";
import { signToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "../services/jwt";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

const auth = new Hono();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
  deviceFingerprint: z.string().max(256).optional().default(""),
  deviceLabel: z.string().max(256).optional().default(""),
});

const registerSchema = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(4).max(128),
  displayName: z.string().max(64).optional().default(""),
});

function publicUser(u: {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  role: string;
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    role: u.role,
  };
}

/** Derive a short human-readable device label from the User-Agent header. */
function deviceLabelFromUA(ua: string): string {
  if (!ua) return "Unknown device";
  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  let browser = "Browser";
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";
  return `${browser} on ${os}`;
}

// 5 login attempts per 15s per IP — brute-force protection for the public site.
const loginLimiter = rateLimit({ max: 5, windowMs: 15_000 });

/** POST /auth/login */
auth.post("/login", loginLimiter, zValidator("json", loginSchema), async (c) => {
  const { username, password, rememberMe, deviceFingerprint, deviceLabel } = c.req.valid("json");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid username or password" }, 401);
  }
  const token = await signToken({ sub: user.id, username: user.username });
  let refreshToken: string | null = null;
  if (rememberMe && deviceFingerprint) {
    const label = deviceLabel || deviceLabelFromUA(c.req.header("user-agent") ?? "");
    refreshToken = await issueRefreshToken({
      userId: user.id,
      deviceFingerprint,
      deviceLabel: label,
    });
  }
  return c.json({ token, refreshToken, user: publicUser(user) });
});

/**
 * POST /auth/register — bootstrap-only.
 * Allowed only when zero users exist (first admin setup). Once any user exists,
 * self-registration is closed; admins create users via /api/users.
 */
auth.post("/register", rateLimit({ max: 5, windowMs: 60_000 }), zValidator("json", registerSchema), async (c) => {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return c.json({ error: "Registration is closed. Ask an administrator for an account." }, 403);
  }
  const { username, password, displayName } = c.req.valid("json");
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, displayName, role: "ADMIN" },
  });
  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({ token, refreshToken: null, user: publicUser(user) });
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceFingerprint: z.string().min(1).max(256),
});

/** POST /auth/refresh — exchange a refresh token for a new access JWT (rotates the refresh token). */
auth.post("/refresh", zValidator("json", refreshSchema), async (c) => {
  const { refreshToken, deviceFingerprint } = c.req.valid("json");
  const result = await rotateRefreshToken({ token: refreshToken, deviceFingerprint });
  if (!result) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({ token, refreshToken: result.token, user: publicUser(user) });
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

/** POST /auth/logout — revoke the provided refresh token (device). */
auth.post("/logout", zValidator("json", logoutSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  return c.json({ ok: true });
});

/** GET /auth/me */
auth.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json(publicUser(user));
});

// ---------- Devices (active sessions) ----------

/** GET /auth/devices — list the current user's remembered devices. */
auth.get("/devices", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const rows = await prisma.refreshToken.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      deviceLabel: true,
      deviceFingerprint: true,
      lastUsedAt: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  return c.json(
    rows.map((r) => ({
      id: r.id,
      deviceLabel: r.deviceLabel,
      lastUsedAt: r.lastUsedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }))
  );
});

/** DELETE /auth/devices/:id — revoke a remembered device (ends that session). */
auth.delete("/devices/:id", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const targetId = c.req.param("id");
  const row = await prisma.refreshToken.findUnique({ where: { id: targetId } });
  if (!row || row.userId !== userId) {
    return c.json({ error: "Device not found" }, 404);
  }
  await prisma.refreshToken.delete({ where: { id: targetId } });
  return c.json({ ok: true });
});

/** DELETE /auth/devices — revoke all of the current user's devices (force re-login everywhere). */
auth.delete("/devices", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  await prisma.refreshToken.deleteMany({ where: { userId } });
  return c.json({ ok: true });
});

// ---------- Profile + password (self-service) ----------

const profileSchema = z.object({
  displayName: z.string().max(64).optional(),
  avatarColor: z.string().max(32).optional(),
});

/** PATCH /auth/profile — update own display name / avatar color. */
auth.patch("/profile", authMiddleware, zValidator("json", profileSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const data: Record<string, string> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.avatarColor !== undefined) data.avatarColor = body.avatarColor;
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return c.json(publicUser(user));
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(4).max(128),
});

/** POST /auth/password — change own password (verifies current). */
auth.post("/password", authMiddleware, zValidator("json", passwordSchema), async (c) => {
  const { userId } = c.get("auth");
  const { currentPassword, newPassword } = c.req.valid("json");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "Not found" }, 404);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  // Revoke all refresh tokens — force re-login on other devices after a password change.
  await prisma.refreshToken.deleteMany({ where: { userId } });
  return c.json({ ok: true });
});

// ---------- Data export + account deletion ----------

/** GET /auth/export — download the user's data as a JSON document. */
auth.get("/export", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const [user, notes, tasks, courses, decks, habits, events, files, folders, studySessions, workspaces] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true, avatarColor: true, role: true, createdAt: true },
      }),
      prisma.note.findMany({ where: { userId }, select: { title: true, content: true, tags: true, pinned: true, createdAt: true, updatedAt: true } }),
      prisma.task.findMany({ where: { userId }, select: { title: true, description: true, status: true, priority: true, dueDate: true, createdAt: true, updatedAt: true } }),
      prisma.course.findMany({ where: { userId }, include: { assignments: { select: { name: true, score: true, maxScore: true, weight: true, category: true } } } }),
      prisma.flashcardDeck.findMany({ where: { userId }, include: { cards: { select: { front: true, back: true } } } }),
      prisma.habit.findMany({ where: { userId }, select: { name: true, icon: true, cadence: true, target: true, logs: { select: { date: true, value: true } } } }),
      prisma.calendarEvent.findMany({ where: { userId }, select: { title: true, description: true, start: true, end: true, allDay: true, location: true, source: true } }),
      prisma.vFile.findMany({ where: { userId }, select: { name: true, mimeType: true, size: true, starred: true, createdAt: true } }),
      prisma.vFolder.findMany({ where: { userId }, select: { name: true, parentId: true, createdAt: true } }),
      prisma.studySession.findMany({ where: { userId }, select: { type: true, title: true, createdAt: true } }),
      prisma.workspace.findMany({ where: { userId }, select: { name: true, layout: true, createdAt: true } }),
    ]);
  if (!user) return c.json({ error: "Not found" }, 404);

  const dump = {
    exportedAt: new Date().toISOString(),
    user,
    notes,
    tasks,
    courses,
    flashcardDecks: decks,
    habits,
    calendarEvents: events,
    files: { folders, files },
    studySessions,
    workspaces,
  };
  // Return as a downloadable JSON attachment.
  const body = JSON.stringify(dump, null, 2);
  c.header("Content-Type", "application/json");
  c.header(
    "Content-Disposition",
    `attachment; filename="athena-export-${user.username}-${Date.now()}.json"`
  );
  return c.body(body);
});

const deleteSchema = z.object({
  password: z.string().min(1),
});

/** DELETE /auth/account — delete own account (requires password confirmation). */
auth.delete("/account", authMiddleware, zValidator("json", deleteSchema), async (c) => {
  const { userId } = c.get("auth");
  const { password } = c.req.valid("json");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "Not found" }, 404);
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Password is incorrect" }, 401);
  }
  // Cascade deletes handle all related user data (notes, tasks, files, refresh tokens, etc.).
  await prisma.user.delete({ where: { id: userId } });
  return c.json({ ok: true });
});

export default auth;

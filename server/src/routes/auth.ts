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

/** POST /auth/login */
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid username or password" }, 401);
  }
  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({ token, user: publicUser(user) });
});

/** POST /auth/register — only allowed if no users exist yet (bootstrap), or always for dev. */
auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { username, password, displayName } = c.req.valid("json");
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // First user becomes an admin; subsequent self-registrations are regular users.
  const userCount = await prisma.user.count();
  const user = await prisma.user.create({
    data: { username, passwordHash, displayName, role: userCount === 0 ? "ADMIN" : "USER" },
  });
  const token = await signToken({ sub: user.id, username: user.username });
  return c.json({ token, user: publicUser(user) });
});

/** GET /auth/me */
auth.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json(publicUser(user));
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
  // Cascade deletes handle all related user data (notes, tasks, files, etc.).
  await prisma.user.delete({ where: { id: userId } });
  return c.json({ ok: true });
});

export default auth;

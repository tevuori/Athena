import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import {
  encryptPassword,
  decryptPassword,
  vutLogin,
  fetchGrades,
  fetchTimetable,
  fetchSubjectUpdates,
  isVutAuthenticated,
  proxyVutPage,
  clearVutSession,
} from "../services/vut";

const vut = new Hono();
vut.use("*", authMiddleware);

// ===== Credential Management =====

const credSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Save credentials + attempt login
vut.post("/login", zValidator("json", credSchema), async (c) => {
  const { userId } = c.get("auth");
  const { username, password } = c.req.valid("json");

  // Try to login first
  const result = await vutLogin(userId, username, password);
  if (!result.success) {
    return c.json({ error: result.error ?? "Login failed" }, 401);
  }

  // Save credentials (encrypt password)
  const passwordEnc = encryptPassword(password);
  await prisma.vutCredentials.upsert({
    where: { userId },
    create: { userId, username, passwordEnc },
    update: { username, passwordEnc },
  });

  return c.json({ ok: true, username });
});

// Check if credentials are saved + session status
vut.get("/status", async (c) => {
  const { userId } = c.get("auth");
  const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
  if (!creds) {
    return c.json({ configured: false, authenticated: false });
  }
  return c.json({
    configured: true,
    username: creds.username,
    authenticated: isVutAuthenticated(userId),
  });
});

// Logout (clear session)
vut.post("/logout", async (c) => {
  const { userId } = c.get("auth");
  clearVutSession(userId);
  return c.json({ ok: true });
});

// Delete saved credentials
vut.delete("/credentials", async (c) => {
  const { userId } = c.get("auth");
  await prisma.vutCredentials.deleteMany({ where: { userId } });
  clearVutSession(userId);
  return c.json({ ok: true });
});

// ===== Data Fetching =====

async function getCreds(userId: string) {
  const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
  if (!creds) return null;
  return {
    username: creds.username,
    password: decryptPassword(creds.passwordEnc),
  };
}

vut.get("/grades", async (c) => {
  const { userId } = c.get("auth");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    const result = await fetchGrades(userId, creds);
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

vut.get("/timetable", async (c) => {
  const { userId } = c.get("auth");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    const slots = await fetchTimetable(userId, creds);
    return c.json({ slots });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

vut.get("/updates", async (c) => {
  const { userId } = c.get("auth");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    const updates = await fetchSubjectUpdates(userId, creds);
    return c.json({ updates });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// ===== Web Proxy (for iframe embedding) =====

vut.get("/proxy", async (c) => {
  const { userId } = c.get("auth");
  const path = c.req.query("path") ?? "/studis/student.phtml?sn=el_index";
  const creds = await getCreds(userId);
  if (!creds) return c.text("VUT credentials not configured", 400);
  try {
    const { html, contentType } = await proxyVutPage(userId, path, creds);
    return c.html(html);
  } catch (e) {
    return c.text(`Proxy error: ${(e as Error).message}`, 502);
  }
});

export default vut;

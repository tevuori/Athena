import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import path from "node:path";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";

const files = new Hono();
files.use("*", authMiddleware);

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

async function ensureUploadDir(userId: string) {
  const dir = path.join(UPLOAD_DIR, userId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ---------- Folders ----------
const folderSchema = z.object({
  name: z.string().min(1).max(64),
  parentId: z.string().nullable().optional(),
});

files.get("/folders", async (c) => {
  const { userId } = c.get("auth");
  const parentId = c.req.query("parentId");
  const where: Record<string, unknown> = { userId };
  if (parentId) where.parentId = parentId === "null" ? null : parentId;
  const folders = await prisma.vFolder.findMany({ where: where as never, orderBy: { name: "asc" } });
  return c.json({ folders });
});

files.post("/folders", zValidator("json", folderSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const folder = await prisma.vFolder.create({
    data: { ...body, userId, parentId: body.parentId ?? null },
  });
  return c.json({ folder }, 201);
});

files.delete("/folders/:id", async (c) => {
  const { userId } = c.get("auth");
  await prisma.vFolder.delete({ where: { id: c.req.param("id"), userId } });
  return c.json({ ok: true });
});

// ---------- Files ----------
files.get("/", async (c) => {
  const { userId } = c.get("auth");
  const folderId = c.req.query("folderId");
  const where: Record<string, unknown> = { userId };
  if (folderId) where.folderId = folderId === "null" ? null : folderId;
  const list = await prisma.vFile.findMany({ where: where as never, orderBy: { name: "asc" } });
  return c.json({ files: list });
});

/** POST /files/upload  multipart: file + optional folderId */
files.post("/upload", async (c) => {
  const { userId } = c.get("auth");
  const formData = await c.req.formData();
  const file = formData.get("file");
  const folderId = (formData.get("folderId") as string | null) ?? null;
  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }
  const userDir = await ensureUploadDir(userId);
  const safeName = path.basename(file.name).replace(/[^\w.\- ]+/g, "_");
  const storageKey = `${userId}/${Date.now()}-${safeName}`;
  const absPath = path.join(UPLOAD_DIR, storageKey);
  await mkdir(path.dirname(absPath), { recursive: true });
  const buf = await file.arrayBuffer();
  await writeFile(absPath, Buffer.from(buf));

  const record = await prisma.vFile.create({
    data: {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storageKey,
      folderId: folderId || null,
      userId,
    },
  });
  return c.json({ file: record }, 201);
});

/** GET /files/:id/download */
files.get("/:id/download", async (c) => {
  const { userId } = c.get("auth");
  const record = await prisma.vFile.findFirst({ where: { id: c.req.param("id"), userId } });
  if (!record) return c.json({ error: "Not found" }, 404);
  const absPath = path.join(UPLOAD_DIR, record.storageKey);
  try {
    await stat(absPath);
  } catch {
    return c.json({ error: "File missing on disk" }, 410);
  }
  const f = Bun.file(absPath);
  return new Response(f, {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `inline; filename="${record.name}"`,
      "Content-Length": String(record.size),
    },
  });
});

files.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const record = await prisma.vFile.findFirst({ where: { id: c.req.param("id"), userId } });
  if (!record) return c.json({ error: "Not found" }, 404);
  const absPath = path.join(UPLOAD_DIR, record.storageKey);
  await unlink(absPath).catch(() => {});
  await prisma.vFile.delete({ where: { id: record.id } });
  return c.json({ ok: true });
});

export default files;

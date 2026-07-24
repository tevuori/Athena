// ===== Microsoft Calendar sync =====
// Pulls events from the user's Microsoft (Outlook) calendar via Graph API
// and upserts them as CalendarEvent rows (source="microsoft", sourceRef=msId).
// Also supports pushing local events to Microsoft and deleting from MS.
// Each user configures their own Microsoft credentials (per-user encrypted DB).

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { encryptSecret } from "../services/crypto";
import {
  getUserMsConfig,
  isMicrosoftConfiguredFor,
  listEvents,
  createEvent as msCreateEvent,
  updateEvent as msUpdateEvent,
  deleteEvent as msDeleteEvent,
  type MsGraphEvent,
} from "../services/microsoft";

const microsoft = new Hono();
microsoft.use("*", authMiddleware);

// ---------- Credential management (per-user) ----------

const credSchema = z.object({
  clientId: z.string().min(1).max(256),
  clientSecret: z.string().min(1).max(256),
  tenantId: z.string().max(256).optional().or(z.literal("")),
  refreshToken: z.string().min(1).max(2048),
});

/** GET /microsoft/credentials — reports whether per-user MS credentials are set. */
microsoft.get("/credentials", async (c) => {
  const { userId } = c.get("auth");
  const cred = await prisma.microsoftCredential.findUnique({ where: { userId } });
  const hasEnv = Boolean(
    process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_REFRESH_TOKEN
  );
  return c.json({
    hasCredentials: Boolean(cred),
    configured: await isMicrosoftConfiguredFor(userId),
    usingEnvFallback: !cred && hasEnv,
  });
});

/** PUT /microsoft/credentials — store (or replace) the user's encrypted MS credentials. */
microsoft.put("/credentials", zValidator("json", credSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const tenantId = body.tenantId?.trim() || "common";
  await prisma.microsoftCredential.upsert({
    where: { userId },
    create: {
      userId,
      clientIdEnc: encryptSecret(body.clientId.trim()),
      clientSecretEnc: encryptSecret(body.clientSecret.trim()),
      tenantId,
      refreshTokenEnc: encryptSecret(body.refreshToken.trim()),
    },
    update: {
      clientIdEnc: encryptSecret(body.clientId.trim()),
      clientSecretEnc: encryptSecret(body.clientSecret.trim()),
      tenantId,
      refreshTokenEnc: encryptSecret(body.refreshToken.trim()),
    },
  });
  return c.json({ ok: true });
});

/** DELETE /microsoft/credentials — remove the user's stored MS credentials. */
microsoft.delete("/credentials", async (c) => {
  const { userId } = c.get("auth");
  try {
    await prisma.microsoftCredential.delete({ where: { userId } });
  } catch {
    // already absent
  }
  return c.json({ ok: true });
});

// ---------- Calendar sync ----------

// GET /status — is Microsoft Calendar configured for this user?
microsoft.get("/status", async (c) => {
  const { userId } = c.get("auth");
  return c.json({ configured: await isMicrosoftConfiguredFor(userId) });
});

// POST /sync — pull MS events into the DB for a time range.
// Body: { from?, to? } — defaults to ±30 days from now.
// Upserts by sourceRef (= MS event id). Removes local "microsoft" events
// that no longer exist in the remote calendar.
const syncSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

microsoft.post("/sync", zValidator("json", syncSchema), async (c) => {
  const { userId } = c.get("auth");
  if (!(await isMicrosoftConfiguredFor(userId))) {
    return c.json({ error: "Microsoft Calendar not configured" }, 400);
  }
  const body = c.req.valid("json");
  const from = body.from ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = body.to ?? new Date(Date.now() + 30 * 86400000).toISOString();

  let msEvents: MsGraphEvent[];
  try {
    msEvents = await listEvents(userId, from, to);
  } catch (e) {
    const msg = (e as { message?: string }).message ?? "Sync failed";
    return c.json({ error: msg }, 502);
  }

  // Fetch existing local microsoft events in range to detect deletions.
  const existing = await prisma.calendarEvent.findMany({
    where: {
      userId,
      source: "microsoft",
      start: { gte: new Date(from), lte: new Date(to) },
    },
  });
  const msIds = new Set(msEvents.map((e) => e.id));
  const existingByRef = new Map(existing.map((e) => [e.sourceRef, e]));

  let upserted = 0;
  let deleted = 0;

  for (const ms of msEvents) {
    const startStr = ms.start.dateTime;
    const endStr = ms.end.dateTime;
    if (!startStr || !endStr) continue;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const description = ms.body?.content ?? "";
    const location = ms.location?.displayName ?? "";
    // Show busy/free as a dimmer color for non-busy events.
    const color = ms.showAs === "free" || ms.showAs === "tentative" ? "#94a3b8" : "#0ea5e9";

    const existingEvent = existingByRef.get(ms.id);
    if (existingEvent) {
      await prisma.calendarEvent.update({
        where: { id: existingEvent.id },
        data: {
          title: ms.subject || "(Untitled)",
          description,
          start,
          end,
          allDay: ms.isAllDay,
          location,
          color,
        },
      });
    } else {
      await prisma.calendarEvent.create({
        data: {
          userId,
          title: ms.subject || "(Untitled)",
          description,
          start,
          end,
          allDay: ms.isAllDay,
          location,
          color,
          source: "microsoft",
          sourceRef: ms.id,
        },
      });
    }
    upserted++;
    existingByRef.delete(ms.id);
  }

  // Remove local microsoft events that no longer exist remotely.
  for (const stale of existingByRef.values()) {
    await prisma.calendarEvent.delete({ where: { id: stale.id } });
    deleted++;
  }

  return c.json({ synced: upserted, deleted, range: { from, to } });
});

// POST /push — push a local CalendarEvent to Microsoft, then link it.
const pushSchema = z.object({
  eventId: z.string(),
});

microsoft.post("/push", zValidator("json", pushSchema), async (c) => {
  const { userId } = c.get("auth");
  if (!(await isMicrosoftConfiguredFor(userId))) {
    return c.json({ error: "Microsoft Calendar not configured" }, 400);
  }
  const { eventId } = c.req.valid("json");
  const local = await prisma.calendarEvent.findUnique({
    where: { id: eventId, userId },
  });
  if (!local) return c.json({ error: "Event not found" }, 404);

  // If already linked to MS, update instead of create.
  if (local.sourceRef && local.source === "microsoft") {
    try {
      const updated = await msUpdateEvent(userId, local.sourceRef, {
        subject: local.title,
        body: local.description,
        start: local.start.toISOString(),
        end: local.end.toISOString(),
        isAllDay: local.allDay,
        location: local.location,
      });
      return c.json({ event: updated, updated: true });
    } catch (e) {
      return c.json({ error: (e as { message?: string }).message ?? "Push failed" }, 502);
    }
  }

  try {
    const created = await msCreateEvent(userId, {
      subject: local.title,
      body: local.description,
      start: local.start.toISOString(),
      end: local.end.toISOString(),
      isAllDay: local.allDay,
      location: local.location,
    });
    // Link the local event to the MS event.
    await prisma.calendarEvent.update({
      where: { id: local.id },
      data: { source: "microsoft", sourceRef: created.id },
    });
    return c.json({ event: created, created: true }, 201);
  } catch (e) {
    return c.json({ error: (e as { message?: string }).message ?? "Push failed" }, 502);
  }
});

// DELETE /event/:msId — delete an event from Microsoft calendar.
microsoft.delete("/event/:msId", async (c) => {
  const { userId } = c.get("auth");
  if (!(await isMicrosoftConfiguredFor(userId))) {
    return c.json({ error: "Microsoft Calendar not configured" }, 400);
  }
  const msId = c.req.param("msId");
  try {
    await msDeleteEvent(userId, msId);
  } catch (e) {
    return c.json({ error: (e as { message?: string }).message ?? "Delete failed" }, 502);
  }
  // Also remove the local copy if it exists.
  await prisma.calendarEvent.deleteMany({
    where: { userId, source: "microsoft", sourceRef: msId },
  });
  return c.json({ ok: true });
});

export default microsoft;

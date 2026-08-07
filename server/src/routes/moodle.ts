// ===== Moodle API routes =====
// Endpoints for listing courses, course contents, and fetching resource text.
// Reuses VUT credentials (id.vut.cz SSO) for authentication.

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { requireVutAccess } from "../middleware/vut-access";
import { decryptSecret } from "../services/crypto";
import {
  moodleLogin,
  fetchMoodlePage,
  fetchResourceContent,
  fetchAssignmentDetail,
  parseMyCourses,
  parseCourseContents,
  isMoodleReady,
} from "../services/moodle";
import { syncCourse, desyncCourse, listSyncedCourses } from "../services/moodle-sync";

const moodle = new Hono();
moodle.use("*", authMiddleware, requireVutAccess);

async function getCreds(userId: string) {
  const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
  if (!creds) return null;
  return { username: creds.username, password: decryptSecret(creds.passwordEnc) };
}

/** GET /api/moodle/status — check if VUT credentials are configured + Moodle is accessible. */
moodle.get("/status", async (c) => {
  const { userId } = c.get("auth");
  const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
  if (!creds) {
    return c.json({ configured: false, authenticated: false });
  }
  return c.json({
    configured: true,
    username: creds.username,
    authenticated: isMoodleReady(userId),
  });
});

/** POST /api/moodle/login — authenticate to Moodle via VUT SSO. */
moodle.post("/login", async (c) => {
  const { userId } = c.get("auth");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured. Log in via the VUT app first." }, 400);
  try {
    const result = await moodleLogin(userId, creds);
    if (!result.success) return c.json({ error: result.error ?? "Moodle login failed" }, 401);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** GET /api/moodle/courses — list enrolled courses. */
moodle.get("/courses", async (c) => {
  const { userId } = c.get("auth");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    // Try the dashboard first, then the custom frontpage.
    let html: string;
    try {
      html = await fetchMoodlePage(userId, "/my/", creds);
    } catch {
      html = await fetchMoodlePage(userId, "/local/customfrontpage/index.php", creds);
    }
    const courses = parseMyCourses(html);
    return c.json({ courses });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** GET /api/moodle/courses/:id/contents — list sections + activities in a course. */
moodle.get("/courses/:id/contents", async (c) => {
  const { userId } = c.get("auth");
  const courseId = c.req.param("id");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    const html = await fetchMoodlePage(userId, `/course/view.php?id=${courseId}`, creds);
    const contents = parseCourseContents(html);
    return c.json(contents);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** POST /api/moodle/resource — fetch the text content of a specific Moodle resource URL. */
const resourceSchema = z.object({
  url: z.string().url(),
});

moodle.post("/resource", zValidator("json", resourceSchema), async (c) => {
  const { userId } = c.get("auth");
  const { url } = c.req.valid("json");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    const content = await fetchResourceContent(userId, url, creds);
    return c.json(content);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** GET /api/moodle/courses/:id/assignments — parsed assignments with deadlines. */
moodle.get("/courses/:id/assignments", async (c) => {
  const { userId } = c.get("auth");
  const courseId = c.req.param("id");
  const creds = await getCreds(userId);
  if (!creds) return c.json({ error: "VUT credentials not configured" }, 400);
  try {
    const html = await fetchMoodlePage(userId, `/course/view.php?id=${courseId}`, creds);
    const contents = parseCourseContents(html);
    const assignments = [];
    for (const section of contents.sections) {
      for (const act of section.activities) {
        if (act.modType !== "assign") continue;
        let dueDate = act.dueDate;
        if (!dueDate) {
          try {
            const detail = await fetchAssignmentDetail(userId, act.url, creds);
            dueDate = detail.dueDate;
          } catch {
            // leave undefined
          }
        }
        assignments.push({
          id: act.id,
          name: act.name,
          url: act.url,
          dueDate,
          description: act.description,
        });
      }
    }
    return c.json({ courseId: contents.courseId, courseName: contents.courseName, assignments });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** GET /api/moodle/sync — list synced courses + their sync state. */
moodle.get("/sync", async (c) => {
  const { userId } = c.get("auth");
  const rows = await listSyncedCourses(userId);
  return c.json({
    synced: rows.map((r) => ({
      courseId: r.courseId,
      courseName: r.courseName,
      lastSyncAt: r.lastSyncAt.toISOString(),
      assignmentCount: r.assignmentCount,
      materialCount: r.materialCount,
    })),
  });
});

/** POST /api/moodle/sync/:courseId — sync a course into Tasks/Calendar/Files. */
moodle.post("/sync/:courseId", async (c) => {
  const { userId } = c.get("auth");
  const courseId = c.req.param("courseId");
  try {
    const result = await syncCourse(userId, courseId);
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** DELETE /api/moodle/sync/:courseId — remove a course's synced rows. */
moodle.delete("/sync/:courseId", async (c) => {
  const { userId } = c.get("auth");
  const courseId = c.req.param("courseId");
  try {
    const result = await desyncCourse(userId, courseId);
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default moodle;

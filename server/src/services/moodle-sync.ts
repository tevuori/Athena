// ===== Moodle sync service =====
// Syncs a Moodle course into the OS:
//   - Assignments with due dates → Tasks (deduped by a marker in description)
//     and Calendar events (source: "moodle", sourceRef: "courseId:activityId")
//   - Fetchable materials (resource/page/url/folder/book/lesson) → virtual
//     VFile rows (source: "moodle", externalUrl set, no blob on disk) under a
//     Moodle/<course>/<section> folder tree.
//
// Dedupe strategy: every synced row carries a sourceRef prefixed with the
// courseId ("courseId:activityId") so a desync can delete exactly that course's
// rows without re-fetching from Moodle. Tasks have no source/sourceRef column,
// so they carry a `[moodle:courseId:activityId]` marker in the description.

import prisma from "../db/client";
import { decryptSecret } from "./crypto";
import {
  fetchMoodlePage,
  parseCourseContents,
  fetchAssignmentDetail,
  type MoodleActivity,
} from "./moodle";

const MOODLE_ROOT_FOLDER = "Moodle";
const MARKER_PREFIX = "[moodle:"; // task description marker prefix

/** Marker embedded in a task description to identify its Moodle origin. */
function taskMarker(courseId: string, activityId: string): string {
  return `${MARKER_PREFIX}${courseId}:${activityId}]`;
}

/** sourceRef used on CalendarEvent + VFile rows. */
function sourceRef(courseId: string, activityId: string): string {
  return `${courseId}:${activityId}`;
}

async function getCreds(userId: string) {
  const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
  if (!creds) return null;
  return { username: creds.username, password: decryptSecret(creds.passwordEnc) };
}

/** Find or create a VFolder by name + parent. */
async function ensureFolder(userId: string, name: string, parentId: string | null): Promise<string> {
  const existing = await prisma.vFolder.findFirst({
    where: { userId, name, parentId },
  });
  if (existing) return existing.id;
  const created = await prisma.vFolder.create({
    data: { userId, name, parentId },
  });
  return created.id;
}

/** Guess a mime type + extension from a Moodle activity for the virtual file. */
function activityMime(act: MoodleActivity): { mime: string } {
  switch (act.modType) {
    case "page": return { mime: "text/html" };
    case "url": return { mime: "application/url" };
    case "folder": return { mime: "application/vnd.moodle.folder" };
    case "assign": return { mime: "text/html" };
    case "book": return { mime: "text/html" };
    case "lesson": return { mime: "text/html" };
    default: return { mime: "application/octet-stream" };
  }
}

export interface SyncResult {
  courseId: string;
  courseName: string;
  assignments: number;
  materials: number;
  tasksCreated: number;
  eventsCreated: number;
  filesCreated: number;
  skippedNoDueDate: number;
}

/**
 * Sync a Moodle course: pull contents, upsert assignments (with due dates) into
 * Tasks + Calendar, and upsert fetchable materials as virtual VFiles.
 */
export async function syncCourse(
  userId: string,
  courseId: string
): Promise<SyncResult> {
  const creds = await getCreds(userId);
  if (!creds) throw new Error("VUT credentials not configured. Log in via the VUT app first.");

  const html = await fetchMoodlePage(userId, `/course/view.php?id=${courseId}`, creds);
  const contents = parseCourseContents(html);
  const courseName = contents.courseName || `Course ${courseId}`;

  // Build the folder tree: Moodle / <course> / <section>
  const rootFolderId = await ensureFolder(userId, MOODLE_ROOT_FOLDER, null);
  const courseFolderId = await ensureFolder(userId, courseName, rootFolderId);

  let assignments = 0;
  let materials = 0;
  let tasksCreated = 0;
  let eventsCreated = 0;
  let filesCreated = 0;
  let skippedNoDueDate = 0;

  for (const section of contents.sections) {
    const sectionFolderId = await ensureFolder(userId, section.name, courseFolderId);

    for (const act of section.activities) {
      const ref = sourceRef(courseId, act.id);

      // ----- Assignments → Task + Calendar event -----
      if (act.modType === "assign") {
        assignments++;
        let dueDate = act.dueDate;

        // If the course page didn't surface a due date, fetch the assign page.
        if (!dueDate) {
          try {
            const detail = await fetchAssignmentDetail(userId, act.url, creds);
            dueDate = detail.dueDate;
          } catch {
            // ignore — leave undefined
          }
        }

        if (!dueDate) {
          skippedNoDueDate++;
          continue;
        }

        const due = new Date(dueDate);
        const desc = `${act.description ?? ""}\n\n${taskMarker(courseId, act.id)}\n${act.url}`.trim();

        // Upsert Task (dedupe by marker in description).
        const existingTask = await prisma.task.findFirst({
          where: { userId, description: { contains: taskMarker(courseId, act.id) } },
        });
        if (!existingTask) {
          await prisma.task.create({
            data: {
              userId,
              title: `${courseName}: ${act.name}`,
              description: desc,
              priority: "HIGH",
              dueDate: due,
            },
          });
          tasksCreated++;
        } else {
          // Update due date + title in case the assignment changed.
          await prisma.task.update({
            where: { id: existingTask.id },
            data: { title: `${courseName}: ${act.name}`, dueDate: due, description: desc },
          });
        }

        // Upsert Calendar event (dedupe by source + sourceRef).
        const existingEvent = await prisma.calendarEvent.findFirst({
          where: { userId, source: "moodle", sourceRef: ref },
        });
        const eventData = {
          title: `${courseName}: ${act.name}`,
          description: `${act.description ?? ""}\n${act.url}`.trim(),
          start: due,
          end: new Date(due.getTime() + 60 * 60 * 1000), // 1h default
          allDay: false,
          color: "#dc2626", // red for deadlines
          location: "Moodle",
          source: "moodle",
          sourceRef: ref,
        };
        if (!existingEvent) {
          await prisma.calendarEvent.create({ data: { ...eventData, userId } as never });
          eventsCreated++;
        } else {
          await prisma.calendarEvent.update({ where: { id: existingEvent.id }, data: eventData as never });
        }
        continue;
      }

      // ----- Fetchable materials → virtual VFile -----
      if (act.fetchable) {
        materials++;
        const { mime } = activityMime(act);
        const existingFile = await prisma.vFile.findFirst({
          where: { userId, source: "moodle", sourceRef: ref },
        });
        const fileData = {
          name: act.name,
          mimeType: mime,
          size: 0,
          storageKey: "", // virtual — content streamed from externalUrl
          externalUrl: act.url,
          source: "moodle",
          sourceRef: ref,
          folderId: sectionFolderId,
        };
        if (!existingFile) {
          await prisma.vFile.create({ data: { ...fileData, userId } as never });
          filesCreated++;
        } else {
          await prisma.vFile.update({ where: { id: existingFile.id }, data: fileData as never });
        }
      }
    }
  }

  // Record sync state.
  const existingSync = await prisma.moodleSync.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  const syncData = {
    courseName,
    lastSyncAt: new Date(),
    assignmentCount: assignments,
    materialCount: materials,
  };
  if (existingSync) {
    await prisma.moodleSync.update({ where: { id: existingSync.id }, data: syncData });
  } else {
    await prisma.moodleSync.create({ data: { userId, courseId, ...syncData } });
  }

  return {
    courseId,
    courseName,
    assignments,
    materials,
    tasksCreated,
    eventsCreated,
    filesCreated,
    skippedNoDueDate,
  };
}

/**
 * Remove all synced rows for a course (Tasks, Calendar events, virtual files,
 * and the course's folder tree). Does not re-fetch from Moodle — targets rows
 * by the courseId: sourceRef prefix / marker.
 */
export async function desyncCourse(userId: string, courseId: string): Promise<{ removed: boolean }> {
  const refPrefix = `${courseId}:`;
  const marker = `${MARKER_PREFIX}${courseId}:`;

  // Delete virtual files for this course.
  const files = await prisma.vFile.findMany({
    where: { userId, source: "moodle", sourceRef: { startsWith: refPrefix } },
  });
  for (const f of files) {
    await prisma.vFile.delete({ where: { id: f.id } }).catch(() => {});
  }

  // Delete calendar events for this course.
  const events = await prisma.calendarEvent.findMany({
    where: { userId, source: "moodle", sourceRef: { startsWith: refPrefix } },
  });
  for (const e of events) {
    await prisma.calendarEvent.delete({ where: { id: e.id } }).catch(() => {});
  }

  // Delete tasks carrying this course's marker.
  const tasks = await prisma.task.findMany({
    where: { userId, description: { contains: marker } },
  });
  for (const t of tasks) {
    await prisma.task.delete({ where: { id: t.id } }).catch(() => {});
  }

  // Delete the course's folder tree (Moodle / <course> / sections).
  const rootFolder = await prisma.vFolder.findFirst({
    where: { userId, name: MOODLE_ROOT_FOLDER, parentId: null },
  });
  if (rootFolder) {
    const sync = await prisma.moodleSync.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    const courseName = sync?.courseName;
    if (courseName) {
      const courseFolder = await prisma.vFolder.findFirst({
        where: { userId, name: courseName, parentId: rootFolder.id },
      });
      if (courseFolder) {
        await prisma.vFolder.delete({ where: { id: courseFolder.id } }).catch(() => {});
      }
    }
  }

  // Remove the sync record.
  await prisma.moodleSync.deleteMany({
    where: { userId, courseId },
  });

  return { removed: true };
}

/** List sync state for all of the user's synced courses. */
export async function listSyncedCourses(userId: string) {
  return prisma.moodleSync.findMany({
    where: { userId },
    orderBy: { lastSyncAt: "desc" },
  });
}

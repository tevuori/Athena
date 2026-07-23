// ===== Athena Moodle tools =====
// Lets the Athena chat assistant list Moodle courses, browse course contents,
// and fetch resource text — so the user can say "generate flashcards from my
// Moodle Calculus course materials" and Athena can find + fetch the source.

import type { ToolDef } from "./plugin";
import prisma from "../../../db/client";
import { decryptSecret } from "../../crypto";
import {
  fetchMoodlePage,
  parseMyCourses,
  parseCourseContents,
  fetchResourceContent,
} from "../../moodle";

async function getCreds(userId: string) {
  const creds = await prisma.vutCredentials.findUnique({ where: { userId } });
  if (!creds) return null;
  return { username: creds.username, password: decryptSecret(creds.passwordEnc) };
}

export const moodleTools: ToolDef[] = [
  {
    name: "list_moodle_courses",
    description:
      "List the user's enrolled Moodle courses (id, name, url). Requires VUT credentials to be configured. Use to find a course before browsing its contents.",
    parameters: [],
    handler: async (_args, { userId }) => {
      const creds = await getCreds(userId);
      if (!creds) return { error: "VUT credentials not configured. Log in via the VUT app first." };
      try {
        let html: string;
        try {
          html = await fetchMoodlePage(userId, "/my/", creds);
        } catch {
          html = await fetchMoodlePage(userId, "/local/customfrontpage/index.php", creds);
        }
        const courses = parseMyCourses(html);
        return {
          count: courses.length,
          courses: courses.map((c) => ({ id: c.id, name: c.name, url: c.url })),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to fetch Moodle courses" };
      }
    },
  },
  {
    name: "get_moodle_course_contents",
    description:
      "List the sections and activities (materials, pages, assignments, files) in a Moodle course by id. Use list_moodle_courses first to get the course id. Returns activities with their urls and types — fetchable activities can be used as a source for flashcards/summarize/quiz.",
    parameters: [
      { name: "courseId", type: "string", description: "Moodle course id from list_moodle_courses", required: true },
    ],
    handler: async (args, { userId }) => {
      const creds = await getCreds(userId);
      if (!creds) return { error: "VUT credentials not configured." };
      try {
        const html = await fetchMoodlePage(
          userId,
          `/course/view.php?id=${String(args.courseId)}`,
          creds
        );
        const contents = parseCourseContents(html);
        return {
          courseId: contents.courseId,
          courseName: contents.courseName,
          sections: contents.sections.map((s) => ({
            name: s.name,
            activities: s.activities.map((a) => ({
              id: a.id,
              name: a.name,
              url: a.url,
              type: a.modType,
              typeLabel: a.typeLabel,
              fetchable: a.fetchable,
            })),
          })),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to fetch course contents" };
      }
    },
  },
  {
    name: "read_moodle_resource",
    description:
      "Fetch the text content of a Moodle resource (page, file, assignment description) by its URL. Use get_moodle_course_contents first to find resource URLs. Returns the text content that can be used as a source for study workflows.",
    parameters: [
      { name: "url", type: "string", description: "Full Moodle resource URL (from get_moodle_course_contents)", required: true },
    ],
    handler: async (args, { userId }) => {
      const creds = await getCreds(userId);
      if (!creds) return { error: "VUT credentials not configured." };
      try {
        const content = await fetchResourceContent(userId, String(args.url), creds);
        return {
          name: content.name,
          text: content.text.slice(0, 5000), // cap for tool result
          type: content.type,
          externalUrl: content.externalUrl,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to fetch resource" };
      }
    },
  },
];

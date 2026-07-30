// ===== Moodle integration (VUT) =====
// Authenticates to moodle.vut.cz by reusing the existing VUT SSO session
// (id.vut.cz OIDC). The VUT login (services/vut.ts) establishes id.vut.cz
// cookies in the shared per-user CookieJar; Moodle's OIDC login URL redirects
// through id.vut.cz, which recognizes the existing session and completes SSO
// automatically — establishing a MoodleSession cookie in the same jar.
//
// All Moodle data is scraped from the web UI with cheerio (same approach as
// the VUT Studis integration). Moodle's REST API requires a token that can't
// be obtained via OIDC, so scraping is the reliable path.

import * as cheerio from "cheerio";
import { vutLogin, isVutAuthenticated, fetchWithVutSession } from "./vut";

// Re-export session helpers so the moodle route can use them without importing
// from vut.ts directly (keeps the dependency graph clean).
export { isVutAuthenticated as isMoodleReady };

const MOODLE_BASE = "https://moodle.vut.cz";
const MOODLE_OIDC_LOGIN = `${MOODLE_BASE}/auth/oidc/?source=loginpage`;

// ===== Types =====

export interface MoodleCourse {
  id: string; // numeric id from course/view.php?id=XXX
  name: string;
  url: string;
  code?: string; // course short name / code if available
}

export interface MoodleActivity {
  id: string; // numeric id from mod/xxx/view.php?id=XXX
  name: string;
  url: string;
  modType: string; // "resource" | "page" | "url" | "assign" | "folder" | "pdf" | "quiz" | ...
  typeLabel: string; // human-readable type
  /** Whether this activity's text content can be fetched for the Study Hub. */
  fetchable: boolean;
  /** Due date (ISO string) for assignments/quizzes with a deadline, if parseable. */
  dueDate?: string;
  /** Short description / intro text shown under the activity on the course page. */
  description?: string;
}

/** A parsed assignment with its deadline + description, for sync into Tasks/Calendar. */
export interface MoodleAssignment {
  id: string;
  name: string;
  url: string;
  dueDate?: string;
  description?: string;
}

export interface MoodleSection {
  name: string;
  activities: MoodleActivity[];
}

export interface MoodleCourseContents {
  courseId: string;
  courseName: string;
  sections: MoodleSection[];
}

export interface MoodleResourceContent {
  name: string;
  text: string;
  type: string;
  /** External URL for mod/url activities (no text content to fetch). */
  externalUrl?: string;
}

// ===== Session / Authentication =====

// The VUT session (services/vut.ts) stores cookies in a per-user CookieJar.
// We need access to that jar to send id.vut.cz cookies during Moodle OIDC.
// Since the CookieJar class is not exported, we use the vutLogin/fetch helpers
// indirectly: vutLogin establishes the id.vut.cz session, and we fetch Moodle
// pages via a helper that re-authenticates through the VUT session.
//
// However, the CookieJar is internal to vut.ts. To reuse it, we need to either
// export it or create a parallel approach. The cleanest path: export a
// fetchWithVutSession helper from vut.ts that makes arbitrary authenticated
// requests using the user's session jar.
//
// For now, we replicate the minimal session access by importing the internal
// session map. Since vut.ts doesn't export the jar, we'll use a different
// approach: call vutLogin to ensure the id.vut.cz session is active, then
// make Moodle requests. The id.vut.cz cookies are in the jar, but we can't
// access them directly.
//
// Actually, the simplest solution: export a `fetchWithSession` function from
// vut.ts that uses the internal jar. Let me check if one exists... it doesn't.
// So I'll add one to vut.ts.

// ===== Moodle login =====

/**
 * Authenticate to Moodle by riding the existing VUT SSO session.
 * Requires that vutLogin() has been called (or will be called) for this user.
 * Hits the Moodle OIDC login URL → id.vut.cz recognizes the session →
 * redirects back to Moodle with an established session.
 *
 * Returns true if Moodle is accessible (session established).
 */
export async function moodleLogin(
  userId: string,
  credentials: { username: string; password: string }
): Promise<{ success: boolean; error?: string }> {
  // First ensure the VUT (id.vut.cz) session is active.
  if (!isVutAuthenticated(userId)) {
    const result = await vutLogin(userId, credentials.username, credentials.password);
    if (!result.success) {
      return { success: false, error: result.error ?? "VUT authentication failed" };
    }
  }

  // Now hit the Moodle OIDC login URL. The id.vut.cz cookies in the shared
  // jar should let SSO complete automatically.
  try {
    const resp = await fetchWithVutSession(userId, MOODLE_OIDC_LOGIN, {
      redirect: "manual",
    });

    // Follow the full redirect chain (id.vut.cz SSO → back to Moodle).
    // fetchWithVutSession handles redirects + cookie collection.
    const finalUrl = resp.url;
    const html = await resp.text();

    // Check if we're logged in: Moodle pages show "Přihlásit se" (Login) when
    // not authenticated, and the user's name or "Odhlásit se" (Logout) when
    // authenticated.
    const isLoginPage =
      html.includes("auth/oidc") && html.includes("Přihlásit se") && !html.includes("logininfo") ||
      html.includes("loginform");

    if (!isLoginPage) {
      // Verify by fetching the dashboard
      const dashResp = await fetchWithVutSession(userId, `${MOODLE_BASE}/my/`);
      const dashHtml = await dashResp.text();
      if (dashHtml.includes("Odhlásit") || dashHtml.includes("logout") || dashHtml.includes("logininfo")) {
        return { success: true };
      }
    }

    // Even if the redirect didn't fully complete, try the dashboard directly.
    const dashResp = await fetchWithVutSession(userId, `${MOODLE_BASE}/my/`);
    const dashHtml = await dashResp.text();
    if (!dashHtml.includes("loginform") && !dashHtml.includes("Přihlásit se účtem VUT")) {
      return { success: true };
    }

    return { success: false, error: "Moodle SSO did not complete. Try re-entering VUT credentials." };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ===== Data fetching =====

/** Fetch a Moodle page, re-authenticating via VUT SSO if needed. */
export async function fetchMoodlePage(
  userId: string,
  path: string,
  credentials?: { username: string; password: string }
): Promise<string> {
  const url = path.startsWith("http") ? path : `${MOODLE_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  let resp = await fetchWithVutSession(userId, url);

  // If we get a login page, try re-authenticating.
  if (resp.status === 200) {
    const html = await resp.text();
    if (html.includes("loginform") || html.includes("Přihlásit se účtem VUT")) {
      if (credentials) {
        await moodleLogin(userId, credentials);
        resp = await fetchWithVutSession(userId, url);
        return resp.text();
      }
      throw new Error("Not authenticated to Moodle. Please log in via VUT credentials first.");
    }
    return html;
  }

  // Follow redirects
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (loc) {
      return fetchMoodlePage(userId, resolveUrl(url, loc), credentials);
    }
  }

  throw new Error(`Failed to fetch Moodle page (status ${resp.status})`);
}

// ===== Parsers =====

/**
 * Parse the "My courses" / dashboard page for enrolled courses.
 * Moodle dashboard (/my/) lists courses in various containers depending on
 * the theme. We try multiple strategies.
 */
export function parseMyCourses(html: string): MoodleCourse[] {
  const $ = cheerio.load(html);
  const courses: MoodleCourse[] = [];
  const seen = new Set<string>();

  // Strategy 1: course cards on the dashboard (common in Moodle 4.x)
  // Links like /course/view.php?id=XXX
  $('a[href*="/course/view.php?id="]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const idMatch = href.match(/[?&]id=(\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    if (seen.has(id)) return;

    // Get the course name — try various containers
    let name = $a.find(".course-name, .coursename, .title").text().trim();
    if (!name) name = $a.attr("title")?.trim() ?? "";
    if (!name) name = $a.text().trim();
    // Clean up whitespace
    name = name.replace(/\s+/g, " ").trim();
    if (!name) return;

    seen.add(id);
    courses.push({
      id,
      name,
      url: resolveUrl(MOODLE_BASE, href),
    });
  });

  // Strategy 2: course list table or list items
  if (courses.length === 0) {
    $(".course-item, .course-list-item, li.course").each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a[href*="/course/view.php?id="]').first();
      const href = $link.attr("href") ?? "";
      const idMatch = href.match(/[?&]id=(\d+)/);
      if (!idMatch) return;
      const id = idMatch[1];
      if (seen.has(id)) return;
      const name = $link.text().trim() || $el.find(".course-name, .title").text().trim();
      if (!name) return;
      seen.add(id);
      courses.push({ id, name, url: resolveUrl(MOODLE_BASE, href) });
    });
  }

  // Strategy 3: dropdown / select menu of courses
  if (courses.length === 0) {
    $('option[value*="/course/view.php?id="]').each((_, el) => {
      const $opt = $(el);
      const value = $opt.attr("value") ?? "";
      const idMatch = value.match(/[?&]id=(\d+)/);
      if (!idMatch) return;
      const id = idMatch[1];
      if (seen.has(id)) return;
      const name = $opt.text().trim();
      if (!name) return;
      seen.add(id);
      courses.push({ id, name, url: resolveUrl(MOODLE_BASE, value) });
    });
  }

  return courses;
}

/**
 * Parse a course page for sections and activities.
 * Moodle course pages have sections (topics/weeks) with activity modules.
 */
export function parseCourseContents(html: string): MoodleCourseContents {
  const $ = cheerio.load(html);
  const sections: MoodleSection[] = [];

  // Course name from the page header
  const courseName =
    $(".page-header-headings h1, h2").first().text().trim() ||
    $("title").text().trim().replace(/\s*-\s*Moodle.*$/i, "") ||
    "Course";
  const courseIdMatch = $('link[rel="canonical"]').attr("href")?.match(/[?&]id=(\d+)/);
  const courseId = courseIdMatch?.[1] ?? "";

  // Moodle 4.x: sections in <li class="section main"> or <div class="section">
  // Each section has activities in <ul class="section"> or <ul class="topics">
  $("li.section.main, div.section").each((_, sectionEl) => {
    const $section = $(sectionEl);
    let sectionName = $section.find(".sectionname, .section-title, .sectionname").first().text().trim();
    if (!sectionName) sectionName = $section.find("h3, h4").first().text().trim();
    if (!sectionName) sectionName = "General";

    const activities: MoodleActivity[] = [];

    $section.find("li.activity, .activityinstance").each((_, actEl) => {
      const $act = $(actEl);
      const classes = ($act.attr("class") ?? "").split(/\s+/);
      const modTypeClass = classes.find((c) => c.startsWith("modtype_"));
      const modType = modTypeClass?.replace("modtype_", "") ?? "unknown";

      // Activity link
      const $link = $act.find('a.aalink, a[href*="/mod/"]').first();
      const href = $link.attr("href") ?? "";
      const idMatch = href.match(/[?&]id=(\d+)/);
      if (!idMatch) return;

      const id = idMatch[1];
      let name = $act.find(".instancename").first().text().trim();
      if (!name) name = $link.text().trim();
      if (!name) return;
      // Clean up access text
      name = name.replace(/\s+/g, " ").trim();

      const typeLabel = TYPE_LABELS[modType] ?? modType;
      const fetchable = FETCHABLE_TYPES.has(modType);

      // Due date + description: Moodle renders an "activity dates" block and
      // an intro/description under each activity on the course page.
      const dueDate = parseActivityDueDate($act);
      const description = $act.find(".contentafterlink, .description, .activitydesc").first().text().trim().replace(/\s+/g, " ").slice(0, 500) || undefined;

      activities.push({
        id,
        name,
        url: resolveUrl(MOODLE_BASE, href),
        modType,
        typeLabel,
        fetchable,
        dueDate,
        description,
      });
    });

    if (activities.length > 0) {
      sections.push({ name: sectionName, activities });
    }
  });

  // Fallback: if no sections found, try a flat list of activities
  if (sections.length === 0) {
    const activities: MoodleActivity[] = [];
    $('a[href*="/mod/"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href") ?? "";
      const idMatch = href.match(/[?&]id=(\d+)/);
      if (!idMatch) return;
      const id = idMatch[1];
      const modMatch = href.match(/\/mod\/(\w+)\//);
      const modType = modMatch?.[1] ?? "unknown";
      let name = $a.find(".instancename").first().text().trim() || $a.text().trim();
      if (!name) return;
      name = name.replace(/\s+/g, " ").trim();
      if (activities.some((a) => a.id === id)) return;
      activities.push({
        id,
        name,
        url: resolveUrl(MOODLE_BASE, href),
        modType,
        typeLabel: TYPE_LABELS[modType] ?? modType,
        fetchable: FETCHABLE_TYPES.has(modType),
      });
    });
    if (activities.length > 0) {
      sections.push({ name: "Course materials", activities });
    }
  }

  return { courseId, courseName, sections };
}

/**
 * Parse a due date from an activity element. Moodle 4.x renders dates in a
 * `.activitydates` container, often with `<time datetime="ISO">` or text like
 * "Due: 3 Sep 2025, 18:00". Returns an ISO string or undefined.
 */
function parseActivityDueDate($act: cheerio.Cheerio<any>): string | undefined {
  const $dates = $act.find(".activitydates, .activity-dates, .datesubmit");
  if (!$dates.length) return undefined;

  // Prefer an ISO <time datetime="..."> element.
  const isoAttr = $dates.find("time[datetime]").first().attr("datetime");
  if (isoAttr) {
    const d = new Date(isoAttr);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Fall back to text parsing: "Due: 3 Sep 2025, 18:00" / "Odevzdání: 3. 9. 2025, 18:00"
  const text = $dates.text().replace(/\s+/g, " ").trim();
  return parseMoodleDateText(text);
}

/**
 * Best-effort parse of Moodle/VUT date text (EN + CS locales).
 * Handles "3 Sep 2025, 18:00", "3. 9. 2025 18:00", "3.9.2025 18:00".
 * Returns ISO string or undefined if no date is found.
 */
export function parseMoodleDateText(text: string): string | undefined {
  if (!text) return undefined;
  const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7,
    sep: 8, oct: 9, nov: 10, dec: 11,
    led: 0, úno: 1, bře: 2, dub: 3, kvě: 4, čvn: 5, čvc: 6, srp: 7,
    zář: 8, říj: 9, lis: 10, pro: 11,
  };

  // "D Mon YYYY, HH:MM"
  let m = text.match(/(\d{1,2})\s+([A-Za-zÀ-ž]{3,})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const day = +m[1], mon = MONTHS[m[2].toLowerCase().slice(0, 3)], year = +m[3], hh = +m[4], mm = +m[5];
    if (mon !== undefined) {
      const d = new Date(Date.UTC(year, mon, day, hh, mm));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }

  // "D. M. YYYY HH:MM" (Czech)
  m = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // "D. M. YYYY" (no time)
  m = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 23, 59));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return undefined;
}

/**
 * Fetch the assignment detail page and extract a precise due date + description.
 * Used when the course page doesn't surface a due date (Moodle hides it for
 * past-due or conditional assignments). Returns the assignment with whatever it
 * could parse.
 */
export async function fetchAssignmentDetail(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleAssignment> {
  const html = await fetchMoodlePage(userId, url, credentials);
  const $ = cheerio.load(html);

  const name = $(".page-header-headings h2, h3").first().text().trim() ||
    $("title").text().trim().replace(/\s*-\s*Moodle.*$/i, "") ||
    "Moodle Assignment";

  // Assignment due date is in the submission status table or a .description block.
  let dueDate: string | undefined;
  const dueText = $("td.c0, .submissionstatustable, .activitydates, .description").text();
  dueDate = parseMoodleDateText(dueText);
  // Also try <time datetime="...">
  const isoAttr = $('time[datetime]').first().attr("datetime");
  if (!dueDate && isoAttr) {
    const d = new Date(isoAttr);
    if (!isNaN(d.getTime())) dueDate = d.toISOString();
  }

  const description = htmlToText($(".intro, .description, #region-main .no-overflow").first().html() ?? "") || undefined;
  const idMatch = url.match(/[?&]id=(\d+)/);

  return { id: idMatch?.[1] ?? "", name, url, dueDate, description };
}

// ===== Resource content fetching =====

/**
 * Fetch the text content of a Moodle resource (page, file, etc.).
 * Returns text suitable for the Study Hub LLM workflows.
 */
export async function fetchResourceContent(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleResourceContent> {
  const modMatch = url.match(/\/mod\/(\w+)\//);
  const modType = modMatch?.[1] ?? "unknown";

  if (modType === "page") {
    return fetchPageContent(userId, url, credentials);
  } else if (modType === "resource") {
    return fetchFileContent(userId, url, credentials);
  } else if (modType === "url") {
    return fetchUrlResource(userId, url, credentials);
  } else if (modType === "folder") {
    return fetchFolderContent(userId, url, credentials);
  } else if (modType === "assign") {
    return fetchAssignContent(userId, url, credentials);
  } else {
    // Generic: fetch the page and extract text
    const html = await fetchMoodlePage(userId, url, credentials);
    const $ = cheerio.load(html);
    const text = extractMainContent($);
    return { name: "", text, type: modType };
  }
}

/** Fetch a mod/page content (HTML page embedded in Moodle). */
async function fetchPageContent(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleResourceContent> {
  const html = await fetchMoodlePage(userId, url, credentials);
  const $ = cheerio.load(html);

  // Moodle page content is in #region-main or .course-content or .mod_page_content
  let $content = $("#region-main .mod_page_content, .mod_page_content").first();
  if (!$content.length) $content = $("#region-main .content, #region-main .no-overflow").first();
  if (!$content.length) $content = $("#region-main").first();

  // Extract the page title
  const name = $(".page-header-headings h2, h3").first().text().trim() ||
    $("title").text().trim().replace(/\s*-\s*Moodle.*$/i, "") ||
    "Moodle Page";

  // Convert HTML to text (preserve some structure)
  const text = htmlToText($content.html() ?? "");
  return { name, text, type: "page" };
}

/** Fetch a mod/resource file (download the file and read if text). */
async function fetchFileContent(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleResourceContent> {
  const html = await fetchMoodlePage(userId, url, credentials);
  const $ = cheerio.load(html);

  const name = $(".page-header-headings h2, h3").first().text().trim() ||
    $("title").text().trim().replace(/\s*-\s*Moodle.*$/i, "") ||
    "Moodle Resource";

  // Find the download link — Moodle resource pages have a link to the file
  const $downloadLink = $('a[href*="forcedownload"], a[href*="/mod/resource/content/"], .resourcework a, .resourcelink a, a.aalink[href*="pluginfile"]').first();
  const downloadUrl = $downloadLink.attr("href");

  if (!downloadUrl) {
    // Maybe the resource is embedded directly (e.g., an inline PDF or text)
    const text = extractMainContent($);
    return { name, text, type: "resource" };
  }

  const absDownloadUrl = resolveUrl(MOODLE_BASE, downloadUrl);
  const resp = await fetchWithVutSession(userId, absDownloadUrl);

  if (!resp.ok) {
    return { name, text: `[Failed to download resource: status ${resp.status}]`, type: "resource" };
  }

  const contentType = resp.headers.get("content-type") ?? "";

  // If it's text-based, read it
  if (contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml") || contentType.includes("javascript")) {
    const text = await resp.text();
    return { name, text, type: "resource" };
  }

  // For HTML resources (some Moodle resources serve HTML)
  if (contentType.includes("html")) {
    const html = await resp.text();
    const $ = cheerio.load(html);
    return { name, text: htmlToText($("body").html() ?? ""), type: "resource" };
  }

  // For PDFs and other binary formats — we can't extract text without a parser.
  // Return a note so the user knows.
  return {
    name,
    text: `[This is a ${contentType || "binary"} file (${name}). Text extraction is not supported for this format. Try using a text-based resource instead.]`,
    type: "resource",
  };
}

/** Fetch a mod/url resource (external URL — can't fetch content, return metadata). */
async function fetchUrlResource(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleResourceContent> {
  const html = await fetchMoodlePage(userId, url, credentials);
  const $ = cheerio.load(html);

  const name = $(".page-header-headings h2, h3").first().text().trim() ||
    $("title").text().trim().replace(/\s*-\s*Moodle.*$/i, "") ||
    "External URL";

  // Moodle URL resources redirect to an external page or show it in an iframe
  const externalUrl = $('a[href^="http"]').filter((_, el) => {
    const href = $(el).attr("href") ?? "";
    return !href.includes("moodle.vut.cz") && !href.includes("vut.cz") && !href.startsWith("#");
  }).first().attr("href");

  const text = `[This is an external URL resource: ${externalUrl ?? "unknown"}. Content cannot be fetched directly. Visit the URL in your browser.]`;
  return { name, text, type: "url", externalUrl };
}

/** Fetch a mod/folder resource (list contained files). */
async function fetchFolderContent(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleResourceContent> {
  const html = await fetchMoodlePage(userId, url, credentials);
  const $ = cheerio.load(html);

  const name = $(".page-header-headings h2, h3").first().text().trim() ||
    "Moodle Folder";

  // List files in the folder
  const files: string[] = [];
  $('a[href*="pluginfile"], a[href*="forcedownload"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href") ?? "";
    const fileName = $a.text().trim();
    if (fileName && href) {
      files.push(`- ${fileName}`);
    }
  });

  const text = files.length > 0
    ? `Folder "${name}" contains ${files.length} files:\n${files.join("\n")}\n\nOpen individual files to use them as study sources.`
    : `[Folder "${name}" — no downloadable files found.]`;

  return { name, text, type: "folder" };
}

/** Fetch a mod/assign resource (assignment description). */
async function fetchAssignContent(
  userId: string,
  url: string,
  credentials?: { username: string; password: string }
): Promise<MoodleResourceContent> {
  const html = await fetchMoodlePage(userId, url, credentials);
  const $ = cheerio.load(html);

  const name = $(".page-header-headings h2, h3").first().text().trim() ||
    "Moodle Assignment";

  // Assignment description is in .submissionstatustable or #region-main
  const $content = $(".intro, .description, #region-main .no-overflow").first();
  const text = htmlToText($content.html() ?? extractMainContent($));

  return { name, text, type: "assign" };
}

// ===== Helpers =====

const TYPE_LABELS: Record<string, string> = {
  resource: "File",
  page: "Page",
  url: "URL",
  assign: "Assignment",
  folder: "Folder",
  quiz: "Quiz",
  forum: "Forum",
  choice: "Choice",
  book: "Book",
  chat: "Chat",
  feedback: "Feedback",
  workshop: "Workshop",
  wiki: "Wiki",
  glossary: "Glossary",
  lesson: "Lesson",
  scorm: "SCORM",
  survey: "Survey",
  label: "Label",
  h5pactivity: "H5P",
  bigbluebuttonbn: "BigBlueButton",
  customcert: "Certificate",
};

const FETCHABLE_TYPES = new Set(["resource", "page", "url", "assign", "folder", "book", "lesson"]);

function resolveUrl(base: string, href: string | undefined): string {
  if (!href) return base;
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return new URL(base).origin + href;
  return new URL(href, base).href;
}

/** Extract the main content area text from a Moodle page. */
function extractMainContent($: cheerio.CheerioAPI): string {
  let $content = $("#region-main").first();
  if (!$content.length) $content = $(".course-content").first();
  if (!$content.length) $content = $("body");
  return htmlToText($content.html() ?? "");
}

/** Convert HTML to readable text (preserving some structure). */
function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="_root">${html}</div>`);
  // Remove script/style/nav
  $("#_root script, #_root style, #_root nav, #_root .nav").remove();
  // Convert <br>, <p>, <div> to newlines
  $("#_root br").replaceWith("\n");
  $("#_root p, #_root div, #_root li, #_root h1, #_root h2, #_root h3, #_root h4, #_root h5, #_root h6").each((_, el) => {
    $(el).append("\n");
  });
  // Get text and clean up
  let text = $("#_root").text();
  // Decode entities (cheerio does this automatically for .text())
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

// ===== Session-aware fetch =====
// fetchWithVutSession is imported from ./vut at the top of this file.
// It uses the user's shared session jar to make authenticated requests,
// collecting cookies from each redirect hop (so id.vut.cz SSO cookies and
// Moodle session cookies coexist in the same jar).

import * as cheerio from "cheerio";
import { encryptSecret, decryptSecret } from "./crypto";

// Re-export under the legacy names so existing callers keep working.
export const encryptPassword = encryptSecret;
export const decryptPassword = decryptSecret;

// ===== Cookie Jar =====

class CookieJar {
  private cookies = new Map<string, string>();

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

  setFromHeaders(headers: Headers) {
    const setCookies = headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const parts = sc.split(";")[0].split("=");
      if (parts.length >= 2) {
        this.cookies.set(parts[0].trim(), parts.slice(1).join("=").trim());
      }
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  clear() {
    this.cookies.clear();
  }
}

// ===== VUT Session Manager =====

const VUT_BASE = "https://www.vut.cz";
const IDP_BASE = "https://id.vut.cz";

interface VutSession {
  jar: CookieJar;
  userId: string;
  authenticated: boolean;
  lastAuth: number;
}

const sessions = new Map<string, VutSession>();
const SESSION_TTL = 25 * 60 * 1000; // 25 minutes

function getSession(userId: string): VutSession {
  let s = sessions.get(userId);
  if (!s) {
    s = { jar: new CookieJar(), userId, authenticated: false, lastAuth: 0 };
    sessions.set(userId, s);
  }
  return s;
}

function isSessionValid(s: VutSession): boolean {
  return s.authenticated && Date.now() - s.lastAuth < SESSION_TTL;
}

function resolveUrl(base: string, href: string | undefined): string {
  if (!href) return base;
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return new URL(base).origin + href;
  return new URL(href, base).href;
}

/** Follow a redirect chain manually, collecting cookies. Returns final URL + response. */
async function followRedirects(
  url: string,
  jar: CookieJar,
  maxRedirects = 15
): Promise<{ url: string; resp: Response }> {
  let currentUrl = url;
  for (let i = 0; i < maxRedirects; i++) {
    const resp = await fetch(currentUrl, {
      redirect: "manual",
      headers: { Cookie: jar.header() },
    });
    jar.setFromHeaders(resp.headers);

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) return { url: currentUrl, resp };
      currentUrl = resolveUrl(currentUrl, loc);
      continue;
    }

    // Check for meta refresh or JS redirect in the body
    if (resp.status === 200) {
      const html = await resp.text();
      const $ = cheerio.load(html);

      // Meta refresh
      const metaRefresh = $('meta[http-equiv="refresh"]').attr("content");
      if (metaRefresh) {
        const urlMatch = metaRefresh.match(/url=(.+)/i);
        if (urlMatch) {
          const dest = resolveUrl(currentUrl, urlMatch[1].trim().replace(/&amp;/g, "&"));
          // Consume the body, then follow
          currentUrl = dest;
          continue;
        }
      }

      // JS redirect: window.location.href = "..."
      const scripts = $("script").text();
      const jsRedirectMatch = scripts.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
      if (jsRedirectMatch) {
        const dest = resolveUrl(currentUrl, jsRedirectMatch[1].trim());
        currentUrl = dest;
        continue;
      }

      // No redirect found — return the response (re-parse body later)
      // We already consumed the body, so we need to return a new Response
      return { url: currentUrl, resp: new Response(html, { status: 200, headers: resp.headers }) };
    }

    return { url: currentUrl, resp };
  }
  throw new Error("Too many redirects");
}

/**
 * Authenticate with VUT via OAuth2/OIDC with PKCE.
 *
 * Flow:
 * 1. GET protected page → 301 to login.php (sets VUTSESSIONID cookie)
 * 2. GET login.php → 301 to id.vut.cz/oauth2/authorize (with PKCE params)
 * 3. GET authorize → 200 with meta-refresh to /auth/common/home/default?authSectionId=...
 * 4. GET home/default → 200 with login form (username only)
 * 5. POST username → 303 to /auth/common/password/default?authSectionId=...
 * 6. GET password/default → 200 with password form
 * 7. POST password → 303 to /auth/common/oauth2/authorize?authSectionId=...
 * 8. GET authorize → 302 to /auth/common/authorization/default
 * 9. GET authorization/default → 302 to /auth/common/oauth2/authorize
 * 10. GET authorize → 200 with meta-refresh to token.php?code=...&state=...
 * 11. GET token.php → 301 to student.phtml (session established!)
 */
export async function vutLogin(
  userId: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const session = getSession(userId);
  session.jar.clear();

  try {
    // Step 1: GET protected page → redirects to login.php
    const r1 = await fetch(`${VUT_BASE}/studis/student.phtml?sn=el_index`, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    session.jar.setFromHeaders(r1.headers);
    const loc1 = r1.headers.get("location");
    if (!loc1) {
      if (r1.status === 200) {
        // Already authenticated
        session.authenticated = true;
        session.lastAuth = Date.now();
        return { success: true };
      }
      return { success: false, error: `Unexpected response (status ${r1.status})` };
    }

    // Step 2: GET login.php → redirects to id.vut.cz OAuth2 authorize
    const loginPhpUrl = resolveUrl(VUT_BASE, loc1);
    const r2 = await fetch(loginPhpUrl, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    session.jar.setFromHeaders(r2.headers);
    const loc2 = r2.headers.get("location");
    if (!loc2) {
      return { success: false, error: "Expected OAuth2 authorize redirect" };
    }

    // Step 3: GET OAuth2 authorize → returns HTML with meta-refresh to home/default
    const authorizeUrl = resolveUrl(IDP_BASE, loc2);
    const r3 = await fetch(authorizeUrl, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    session.jar.setFromHeaders(r3.headers);

    if (r3.status !== 200) {
      return { success: false, error: `OAuth2 authorize returned status ${r3.status}` };
    }

    const html3 = await r3.text();
    const $3 = cheerio.load(html3);

    // Extract authSectionId from meta-refresh or JS redirect
    let homeUrl: string | null = null;
    const metaRefresh = $3('meta[http-equiv="refresh"]').attr("content");
    if (metaRefresh) {
      const urlMatch = metaRefresh.match(/url=(.+)/i);
      if (urlMatch) {
        homeUrl = resolveUrl(IDP_BASE, urlMatch[1].trim().replace(/&amp;/g, "&"));
      }
    }
    if (!homeUrl) {
      const jsMatch = html3.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
      if (jsMatch) {
        homeUrl = resolveUrl(IDP_BASE, jsMatch[1].trim());
      }
    }
    if (!homeUrl) {
      return { success: false, error: "Could not find auth section redirect" };
    }

    // Step 4: GET home/default → login form (username only)
    const r4 = await fetch(homeUrl, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    session.jar.setFromHeaders(r4.headers);

    if (r4.status !== 200) {
      return { success: false, error: `Login form page returned status ${r4.status}` };
    }

    const html4 = await r4.text();
    const $4 = cheerio.load(html4);

    // Find the login form
    const loginForm = $4("#frm-signInFormLogin");
    if (!loginForm.length) {
      // Maybe we're already authenticated (no login form shown)
      if (r4.status === 200 && !html4.includes("signInFormLogin")) {
        // Follow the redirect chain to establish session
        const { resp: finalResp } = await followRedirects(homeUrl, session.jar);
        if (finalResp.status === 200) {
          session.authenticated = true;
          session.lastAuth = Date.now();
          return { success: true };
        }
      }
      return { success: false, error: "Login form not found" };
    }

    const formAction = resolveUrl(homeUrl, loginForm.attr("action"));
    const csrfToken = $4('input[name="_token_"]').val() ?? "";
    const doValue = $4('input[name="_do"]').val() ?? "signInFormLogin-submit";

    // Step 5: POST username → redirects to password page
    const r5 = await fetch(formAction, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: session.jar.header(),
        Referer: homeUrl,
      },
      body: new URLSearchParams({
        login: username,
        btnsubmit: "Přejít k ověření",
        _token_: csrfToken,
        webauthn: "",
        _do: doValue,
      }).toString(),
    });
    session.jar.setFromHeaders(r5.headers);

    const loc5 = r5.headers.get("location");
    if (!loc5 || r5.status !== 303) {
      // Check if the response contains an error (e.g. invalid username)
      if (r5.status === 200) {
        const errHtml = await r5.text();
        const $err = cheerio.load(errHtml);
        const errAlert = $err(".alert-danger, .alert-error").text().trim();
        if (errAlert) return { success: false, error: errAlert };
      }
      return { success: false, error: "Username submission failed" };
    }

    // Step 6: GET password page
    const passwordUrl = resolveUrl(IDP_BASE, loc5);
    const r6 = await fetch(passwordUrl, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    session.jar.setFromHeaders(r6.headers);

    if (r6.status !== 200) {
      return { success: false, error: `Password page returned status ${r6.status}` };
    }

    const html6 = await r6.text();
    const $6 = cheerio.load(html6);

    const passwordForm = $6("#signInFormPassword");
    if (!passwordForm.length) {
      return { success: false, error: "Password form not found" };
    }

    const passFormAction = resolveUrl(passwordUrl, passwordForm.attr("action"));
    const passCsrfToken = $6('input[name="_token_"]').val() ?? "";
    const passDoValue = $6('input[name="_do"]').val() ?? "signInFormPassword-submit";
    const loginFieldValue = $6('input[name="login"]').val() ?? username;

    // Step 7: POST password → redirects to OAuth2 authorize
    const r7 = await fetch(passFormAction, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: session.jar.header(),
        Referer: passwordUrl,
      },
      body: new URLSearchParams({
        login: loginFieldValue,
        passwd: password,
        rememberLogin: "on",
        _token_: passCsrfToken,
        fingerprintData: "",
        _do: passDoValue,
      }).toString(),
    });
    session.jar.setFromHeaders(r7.headers);

    const loc7 = r7.headers.get("location");
    if (!loc7 || r7.status !== 303) {
      // Check for error
      if (r7.status === 200) {
        const errHtml = await r7.text();
        const $err = cheerio.load(errHtml);
        const errAlert = $err(".alert-danger, .alert-error").text().trim();
        if (errAlert) return { success: false, error: errAlert };
      }
      return { success: false, error: "Password submission failed — check your credentials" };
    }

    // Step 8-11: Follow the full redirect chain (authorize → authorization → authorize → meta-refresh to token.php → student.phtml)
    const postLoginUrl = resolveUrl(IDP_BASE, loc7);
    const { resp: finalResp } = await followRedirects(postLoginUrl, session.jar);

    // Verify we're authenticated by checking the final page
    if (finalResp.status === 200) {
      const verifyHtml = await finalResp.text();
      // Check for studis content (not a login page)
      if (
        (verifyHtml.includes("el_index") || verifyHtml.includes("studis") || verifyHtml.includes("student.phtml")) &&
        !verifyHtml.includes("signInFormLogin") &&
        !verifyHtml.includes("signInFormPassword")
      ) {
        session.authenticated = true;
        session.lastAuth = Date.now();
        return { success: true };
      }
    }

    // Final verification: try to access the protected page directly
    const verifyResp = await fetch(`${VUT_BASE}/studis/student.phtml?sn=el_index`, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    session.jar.setFromHeaders(verifyResp.headers);

    if (verifyResp.status === 200) {
      const verifyHtml = await verifyResp.text();
      if (!verifyHtml.includes("signInFormLogin") && !verifyHtml.includes("signInFormPassword")) {
        session.authenticated = true;
        session.lastAuth = Date.now();
        return { success: true };
      }
    }

    return { success: false, error: "Authentication failed — check your VUT credentials" };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** Fetch a Studis page with the user's session. Re-authenticates if needed. */
async function fetchStudisPage(
  userId: string,
  sn: string,
  credentials?: { username: string; password: string }
): Promise<string> {
  const session = getSession(userId);

  if (!isSessionValid(session) && credentials) {
    const result = await vutLogin(userId, credentials.username, credentials.password);
    if (!result.success) {
      throw new Error(result.error ?? "Authentication failed");
    }
  }

  if (!session.authenticated) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const url = `${VUT_BASE}/studis/student.phtml?sn=${sn}`;
  const resp = await fetch(url, {
    redirect: "manual",
    headers: { Cookie: session.jar.header() },
  });
  session.jar.setFromHeaders(resp.headers);

  if (resp.status === 200) {
    return resp.text();
  }

  // Session expired — try re-authenticating
  if (resp.status >= 300 && credentials) {
    const result = await vutLogin(userId, credentials.username, credentials.password);
    if (result.success) {
      const retry = await fetch(url, {
        redirect: "manual",
        headers: { Cookie: session.jar.header() },
      });
      if (retry.status === 200) {
        return retry.text();
      }
    }
  }

  throw new Error(`Failed to fetch Studis page (status ${resp.status})`);
}

// ===== Parsers =====

export interface VutGrade {
  courseName: string;
  courseCode: string;
  credits: string;
  semester: string;
  grade: string;
  ectsGrade: string;
  completionType: string;
  score: string; // points scored
  attempt: string; // attempt number
}

export interface VutGradesResult {
  grades: VutGrade[];
  semesters: string[]; // e.g. ["Zimní semestr, 1. ročník, ...", "Letní semestr, ..."]
}

/**
 * Parse the grades page (el_index).
 *
 * VUT grades page structure:
 * - <h2>Akademický rok: 2025/2026</h2>
 * - <h3>Zimní semestr, 1. ročník, ...</h3>
 * - <table class="table table-bordered table-middle">
 *     <thead>
 *       <tr><th colspan="7">Předmět</th><th colspan="8">Hodnocení</th></tr>
 *       <tr>
 *         <th>Zkr.</th><th>Název předmětu</th><th>Jazyk</th><th>Typ</th><th>Kr.</th>
 *         <th>Průměr</th><th>Uk.</th><th>eLearning</th>
 *         <th>Zápočet</th><th>Body</th><th>Zkouška</th><th>Termín</th><th>Absol.</th><th>Potvr.</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr>
 *         <td><a>IDM</a></td>                          ← code
 *         <td><a>Diskrétní matematika</a></td>          ← name
 *         <td>cs</td>                                   ← language
 *         <td><span title="Povinný">P</span></td>       ← type
 *         <td>4</td>                                    ← credits
 *         <td>Ano</td>                                  ← counts toward average
 *         <td><span title="zápočet a zkouška">zá,zk</span></td> ← completion type
 *         <td>...moodle link...</td>                    ← eLearning
 *         <td>...zápočet...</td>                        ← credit
 *         <td>59</td>                                   ← score (points)
 *         <td><b>E</b> ...</td>                         ← grade (ECTS letter)
 *         <td>2</td>                                    ← attempt number
 *         <td>...checkmark...</td>                      ← passed
 *         <td>...checkmark...</td>                      ← confirmed
 *       </tr>
 *     </tbody>
 */
export function parseGrades(html: string): VutGradesResult {
  const $ = cheerio.load(html);
  const grades: VutGrade[] = [];
  const semesters: string[] = [];

  // Find all h3 elements that contain "semestr" (semester headers)
  $("h3").each((_, h3) => {
    const $h3 = $(h3);
    const semesterText = $h3.text().trim();
    if (!semesterText || !semesterText.includes("semestr")) return;

    // Find the next table after this h3 — try multiple strategies
    // Strategy 1: table inside the immediate next sibling (e.g., div.table-responsive > table)
    let $table = $h3.next().find("table").first();
    // Strategy 2: table inside any next div sibling
    if (!$table.length || $table.find("td").length < 10) {
      $table = $h3.nextAll("div").first().find("table").first();
    }
    // Strategy 3: direct sibling table
    if (!$table.length || $table.find("td").length < 10) {
      $table = $h3.nextAll("table").first();
    }
    // Strategy 4: broader search through next siblings
    if (!$table.length || $table.find("td").length < 10) {
      let $next = $h3.next();
      while ($next.length && $next.prop("tagName") !== "H3") {
        const $t = $next.find("table").first();
        if ($t.length && $t.find("td").length >= 10) {
          $table = $t;
          break;
        }
        $next = $next.next();
      }
    }

    if (!$table.length || $table.find("td").length < 10) return;

    semesters.push(semesterText);

    // Parse data rows (rows with td elements, skip header rows with th)
    $table.find("tr").each((_, row) => {
      const $row = $(row);
      const cells = $row.find("td");
      if (cells.length < 10) return; // Skip header rows

      // Cell 0: Code (inside <a>)
      const code = $(cells[0]).find("a").text().trim() || $(cells[0]).text().trim();
      // Cell 1: Name (inside <a>)
      const name = $(cells[1]).find("a").text().trim() || $(cells[1]).text().trim();
      // Cell 2: Language
      // Cell 3: Type (P=povinný, V=volitelný, etc.) — inside <span title="...">
      const typeSpan = $(cells[3]).find("span").first();
      const type = typeSpan.attr("title") || typeSpan.text().trim() || $(cells[3]).text().trim();
      // Cell 4: Credits
      const credits = $(cells[4]).text().trim();
      // Cell 5: Counts toward average
      // Cell 6: Completion type (zá,zk = zápočet a zkouška)
      const completionSpan = $(cells[6]).find("span").first();
      const completionType = completionSpan.attr("title") || completionSpan.text().trim() || $(cells[6]).text().trim();
      // Cell 7: eLearning link (skip)
      // Cell 8: Zápočet (credit) — checkmark or date
      // Cell 9: Score (points)
      const score = $(cells[9]).text().trim();
      // Cell 10: Grade (ECTS letter, inside <b>)
      const gradeText = $(cells[10]).find("b").text().trim() || $(cells[10]).text().trim();
      // Extract just the letter grade (A, B, C, D, E, F)
      const gradeMatch = gradeText.match(/\b([A-F])\b/);
      const grade = gradeMatch?.[1] ?? gradeText;
      // Cell 11: Attempt number
      const attemptSpan = $(cells[11]).find("span").first();
      const attempt = attemptSpan.attr("title") || attemptSpan.text().trim() || $(cells[11]).text().trim();
      // Cell 12: Absolved (checkmark)
      // Cell 13: Confirmed (checkmark)

      if (code && name) {
        grades.push({
          courseName: name,
          courseCode: code,
          credits,
          semester: semesterText,
          grade,
          ectsGrade: grade, // VUT uses ECTS scale (A-F)
          completionType,
          score,
          attempt,
        });
      }
    });
  });

  return { grades, semesters };
}

export interface VutTimetableSlot {
  day: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  courseName: string;
  courseCode: string;
  room: string;
  teacher: string;
  type: string; // "Přednáška", "Cvičení", "Laboratoř", "Zkouška"
  weekType: string; // "Týden", "Nepravidelný", etc.
  date: string; // specific date if applicable
  faculty: string;
  color?: string;
}

const DAY_MAP: Record<string, number> = {
  "Po": 0, "Pondělí": 0,
  "Út": 1, "Úterý": 1, "Ut": 1,
  "St": 2, "Středa": 2,
  "Čt": 3, "Čtvrtek": 3, "Ct": 3,
  "Pá": 4, "Pátek": 4, "Pa": 4,
  "So": 5, "Sobota": 5,
  "Ne": 6, "Neděle": 6,
};

/**
 * Parse the timetable page (osobni_rozvrh).
 *
 * VUT timetable uses a div-based layout:
 * - .rozvrh-dny contains .den (day) divs
 * - Each .den has .popis (day name + date) and .radky > .radek > .blok elements
 * - Each .blok (not .blok-nic) has:
 *   - data-original-title: course name
 *   - data-content: HTML tooltip with details (Zkratka, Datum, Den, Doba, Typ výuky, etc.)
 *   - Visible text: "ISU (P) 9.2.–4.5. 11:00–13:50"
 *   - class: barva-P (lecture), barva-Cp (seminar), barva-C1 (lab), barva-zkouska (exam), barva-S (seminar)
 */
export function parseTimetable(html: string): VutTimetableSlot[] {
  const $ = cheerio.load(html);
  const slots: VutTimetableSlot[] = [];

  // Type mapping from barva-* classes
  const typeFromBarva: Record<string, string> = {
    "barva-P": "Přednáška",
    "barva-Cp": "Cvičení",
    "barva-C1": "Cvičení",
    "barva-C2": "Cvičení",
    "barva-S": "Seminář",
    "barva-zkouska": "Zkouška",
    "barva-L": "Laboratoř",
  };

  // Parse each day
  $(".rozvrh-dny > .den").each((_, dayEl) => {
    const $day = $(dayEl);
    const dayLabel = $day.find(".popis").first().text().trim();
    const dayName = dayLabel.split(/\s/)[0]; // "Po", "Út", etc.
    const dayIndex = DAY_MAP[dayName] ?? 0;

    // Parse each blok-vn (the actual course blocks with data attributes)
    $day.find(".blok-vn").each((_, blokEl) => {
      const $blok = $(blokEl);
      const classes = $blok.attr("class") ?? "";

      const courseName = $blok.attr("data-original-title") ?? "";
      const dataContentRaw = $blok.attr("data-content") ?? "";

      if (!courseName) return;

      // Decode the data-content HTML (it's HTML-entity encoded)
      const decodedContent = decodeHtmlEntities(dataContentRaw);
      const $tooltip = cheerio.load(decodedContent);

      // Extract fields from tooltip table
      const code = $tooltip("th:contains('Zkratka')").next("td").find("a").first().text().trim() ||
                   $tooltip("th:contains('Zkratka')").next("td").text().trim().split(/\s|\(/)[0];
      const date = $tooltip(".tooltip-datum-od").text().trim() ||
                   $tooltip("th:contains('Datum')").next("td").text().trim();
      const timeRange = $tooltip(".tooltip-doba").text().trim() ||
                        $tooltip("th:contains('Doba')").next("td").text().trim();
      const type = $tooltip("th:contains('Typ výuky')").next("td").text().trim() ||
                   (typeFromBarva[classes.split(" ").find((c) => c.startsWith("barva-")) ?? ""] ?? "");
      const weekType = $tooltip("th:contains('Týden')").next("td").text().trim();

      // Room: look for "Místnost" or room info in the tooltip
      let room = $tooltip("th:contains('Místnost')").next("td").text().trim() ||
                 $tooltip("th:contains('Učebna')").next("td").text().trim() || "";

      // If no room in tooltip, try extracting from the visible text
      if (!room) {
        const visibleText = $blok.text().trim();
        // Room codes like "B/E104", "A/1120", "D/0207"
        const roomMatch = visibleText.match(/([A-Z]\/[A-Z0-9]+)/g);
        if (roomMatch) room = roomMatch.join(", ");
      }

      // Teacher: look for "Vyučující" in tooltip
      const teacher = $tooltip("th:contains('Vyučující')").next("td").text().trim() ||
                      $tooltip("th:contains('Učitel')").next("td").text().trim() || "";

      // Faculty: from h5 title, e.g. "Course name (date) (FIT)"
      const facultyMatch = courseName.match(/\((\w+)\)\s*$/);
      const faculty = facultyMatch?.[1] ?? "";

      // Parse time range "11:00–13:50" or "11:00-13:50"
      let startTime = "";
      let endTime = "";
      if (timeRange) {
        const timeMatch = timeRange.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          startTime = timeMatch[1];
          endTime = timeMatch[2];
        }
      }

      // If no time from tooltip, try visible text
      if (!startTime) {
        const visibleText = $blok.text().trim();
        const timeMatch = visibleText.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
        if (timeMatch) {
          startTime = timeMatch[1];
          endTime = timeMatch[2];
        }
      }

      // Extract color from barva-* class
      const barvaClass = classes.split(" ").find((c) => c.startsWith("barva-"));
      const color = barvaClass ?? undefined;

      slots.push({
        day: dayName,
        dayIndex,
        startTime,
        endTime,
        courseName: courseName.replace(/\s*\([^)]+\)\s*$/, "").trim(), // Remove (FIT) suffix
        courseCode: code,
        room,
        teacher,
        type,
        weekType,
        date,
        faculty,
        color,
      });
    });
  });

  return slots;
}

export interface VutSubjectUpdate {
  subjectName: string;
  subjectCode: string;
  date: string;
  title: string;
  content: string;
  author: string;
}

/**
 * Parse the subject updates page (aktuality_predmet).
 *
 * VUT updates page uses a datagrid2 that loads data via AJAX POST.
 * The AJAX response is JSON: [{ type: "dg2Replace", data: "{...JSON string...}" }]
 * Inside data: { data: [ [ {d: "2026-04-22"}, {d: "<a>Title</a>"}, {d: "<a>IVS</a> – Name"}, {d: "<a>Author</a>"} ], ... ] }
 */
export function parseSubjectUpdatesFromAjax(ajaxResponse: string): VutSubjectUpdate[] {
  const updates: VutSubjectUpdate[] = [];

  try {
    const outer = JSON.parse(ajaxResponse);
    if (!Array.isArray(outer) || outer.length === 0) return updates;

    const inner = JSON.parse(outer[0].data);
    if (!inner.data || !Array.isArray(inner.data)) return updates;

    for (const row of inner.data) {
      // row = [ {d: date}, {d: titleHtml}, {d: subjectHtml}, {d: authorHtml} ]
      if (row.length < 4) continue;

      const date = row[0]?.d ?? row[0]?.r ?? "";
      const titleHtml = row[1]?.d ?? "";
      const subjectHtml = row[2]?.d ?? "";
      const authorHtml = row[3]?.d ?? "";

      // Parse HTML to extract text
      const $title = cheerio.load(titleHtml);
      const title = $title("b").text().trim() || $title.text().trim();

      const $subject = cheerio.load(subjectHtml);
      const subjectCode = $subject("b").text().trim();
      const subjectName = $subject.text().trim().replace(/^([A-Z0-9]+)\s*[–-]\s*/, "").trim();

      const $author = cheerio.load(authorHtml);
      const author = $author("i").text().trim() || $author.text().trim();

      updates.push({
        date,
        title,
        subjectName,
        subjectCode,
        content: title, // The title is the main content; clicking would show detail
        author,
      });
    }
  } catch (e) {
    // If JSON parsing fails, return empty
  }

  return updates;
}

/** Decode HTML entities (for data-content attributes) */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

// ===== Public API =====

export async function fetchGrades(
  userId: string,
  credentials?: { username: string; password: string }
): Promise<VutGradesResult> {
  const html = await fetchStudisPage(userId, "el_index", credentials);
  return parseGrades(html);
}

export async function fetchTimetable(
  userId: string,
  credentials?: { username: string; password: string }
): Promise<VutTimetableSlot[]> {
  const html = await fetchStudisPage(userId, "osobni_rozvrh", credentials);
  return parseTimetable(html);
}

export async function fetchSubjectUpdates(
  userId: string,
  credentials?: { username: string; password: string }
): Promise<VutSubjectUpdate[]> {
  const session = getSession(userId);

  // Re-authenticate if needed
  if (!isSessionValid(session) && credentials) {
    const result = await vutLogin(userId, credentials.username, credentials.password);
    if (!result.success) {
      throw new Error(result.error ?? "Authentication failed");
    }
  }

  if (!session.authenticated) {
    throw new Error("Not authenticated. Please log in first.");
  }

  // First, GET the page to obtain the grid ID
  const pageResp = await fetch(`${VUT_BASE}/studis/student.phtml?sn=aktuality_predmet`, {
    redirect: "manual",
    headers: { Cookie: session.jar.header() },
  });
  session.jar.setFromHeaders(pageResp.headers);

  if (pageResp.status !== 200) {
    // Try re-auth
    if (credentials) {
      await vutLogin(userId, credentials.username, credentials.password);
    }
  }

  const pageHtml = await pageResp.text();
  const $ = cheerio.load(pageHtml);

  // Extract grid ID from the datagrid2 div
  const gridDiv = $("#datatable-studis-aktuality-predmet");
  const gridId = gridDiv.attr("data-gridid") ?? "";

  if (!gridId) {
    throw new Error("Could not find datagrid ID on updates page");
  }

  // POST to get the data
  const ajaxResp = await fetch(`${VUT_BASE}/studis/student.phtml?sn=aktuality_predmet`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: session.jar.header(),
      Referer: `${VUT_BASE}/studis/student.phtml?sn=aktuality_predmet`,
    },
    body: new URLSearchParams({
      grid_id: gridId,
      operation: "getData",
      page: "1",
      items_per_page: "25",
    }).toString(),
  });
  session.jar.setFromHeaders(ajaxResp.headers);

  if (ajaxResp.status !== 200) {
    throw new Error(`Failed to fetch updates data (status ${ajaxResp.status})`);
  }

  const ajaxText = await ajaxResp.text();
  return parseSubjectUpdatesFromAjax(ajaxText);
}

/** Check if the user's VUT session is active. */
export function isVutAuthenticated(userId: string): boolean {
  const session = sessions.get(userId);
  return session ? isSessionValid(session) : false;
}

/** Proxy a VUT page for iframe embedding (strips frame-blocking headers). */
export async function proxyVutPage(
  userId: string,
  path: string,
  credentials?: { username: string; password: string }
): Promise<{ html: string; contentType: string }> {
  const session = getSession(userId);

  if (!isSessionValid(session) && credentials) {
    await vutLogin(userId, credentials.username, credentials.password);
  }

  const url = path.startsWith("http") ? path : `${VUT_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const resp = await fetch(url, {
    redirect: "manual",
    headers: { Cookie: session.jar.header() },
  });
  session.jar.setFromHeaders(resp.headers);

  let html: string;

  // If redirected (session expired), try re-auth
  if (resp.status >= 300 && resp.status < 400 && credentials) {
    await vutLogin(userId, credentials.username, credentials.password);
    const retry = await fetch(url, {
      redirect: "manual",
      headers: { Cookie: session.jar.header() },
    });
    html = await retry.text();
  } else if (resp.status === 200) {
    html = await resp.text();
  } else {
    // Follow redirects
    const { resp: finalResp } = await followRedirects(url, session.jar);
    html = await finalResp.text();
  }

  // Rewrite URLs for proxied pages
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("mailto:")) {
      const absolute = resolveUrl(VUT_BASE, href);
      $(el).attr("href", `/api/vut/proxy?path=${encodeURIComponent(absolute)}`);
    } else if (href && href.startsWith("http") && !href.includes("vut.cz")) {
      // External links: keep as-is
    } else if (href && href.startsWith("http") && href.includes("vut.cz")) {
      $(el).attr("href", `/api/vut/proxy?path=${encodeURIComponent(href)}`);
    }
  });
  $("form[action]").each((_, el) => {
    const action = $(el).attr("action");
    if (action && !action.startsWith("http")) {
      const absolute = resolveUrl(VUT_BASE, action);
      $(el).attr("action", `/api/vut/proxy?path=${encodeURIComponent(absolute)}`);
    }
  });
  // Rewrite relative resource URLs to absolute
  $("link[href], script[src], img[src]").each((_, el) => {
    const tag = el.tagName;
    const attr = tag === "link" ? "href" : "src";
    const val = $(el).attr(attr);
    if (val && !val.startsWith("http") && !val.startsWith("data:") && !val.startsWith("#")) {
      const absolute = resolveUrl(VUT_BASE, val);
      $(el).attr(attr, absolute);
    }
  });

  // Remove X-Frame-Options meta tags if any
  $('meta[http-equiv="X-Frame-Options"]').remove();

  return { html: $.html(), contentType: "text/html" };
}

/** Clear a user's VUT session. */
export function clearVutSession(userId: string) {
  sessions.delete(userId);
}

// ===== Interactive Teacher system prompt =====
// Builds the system prompt for the "Teach Me" mode. It grounds Athena in the
// session's StudySources (reusing the [n] citation convention from
// groundedQaSystemPrompt) AND instructs her on how to use the show_source /
// highlight / scroll / comprehension tools to conduct a live, show-and-tell
// tutoring session.
//
// The source-history (ordered list of sources shown so far) is injected so
// Athena can resolve references like "go back to the first file" or "the
// second paragraph" without a separate NL-parsing module.

import { budgetSources, type GroundedSource, langInstr, type StudyLanguage } from "./prompts";

/** An entry in the ordered source-history shown during a session. */
export interface SourceHistoryEntry {
  /** Window id the source was opened in (so Athena can focus/close it). */
  windowId: string;
  /** 1-based source index (matches the SOURCE [n] label). */
  index: number;
  name: string;
  kind: string;
  refId: string;
  /** The last highlight text applied (if any). */
  lastHighlight?: string;
}

export interface TeacherSessionState {
  /** The student's self-assessed level: "beginner" | "intermediate" | "advanced". */
  studentLevel?: string;
  /** Ordered list of sources shown during the session (for reference resolution). */
  sourceHistory?: SourceHistoryEntry[];
  /** Concepts already covered in this session (for pacing / recap). */
  coveredConcepts?: string[];
  /** Comprehension check outcomes: { concept, passed }. */
  comprehensionLog?: { concept: string; passed: boolean }[];
}

export function teacherSystemPrompt(
  sources: GroundedSource[],
  history: SourceHistoryEntry[],
  state: TeacherSessionState,
  lang?: StudyLanguage
): string {
  const budgeted = budgetSources(sources, 60000);
  const blocks = budgeted
    .map((s) => `--- SOURCE [${s.index}] (${s.kind}: ${s.name}) ---\n${s.text}\n`)
    .join("\n");

  const historyLines = history.length
    ? history
        .map(
          (h) =>
            `  - window ${h.windowId}: SOURCE [${h.index}] "${h.name}" (${h.kind})${
              h.lastHighlight ? ` — last highlighted: "${h.lastHighlight.slice(0, 80)}"` : ""
            }`
        )
        .join("\n")
    : "  (none yet)";

  const covered = state.coveredConcepts?.length
    ? state.coveredConcepts.map((c) => `  - ${c}`).join("\n")
    : "  (none yet)";

  const compLog = state.comprehensionLog?.length
    ? state.comprehensionLog
        .map((c) => `  - ${c.concept}: ${c.passed ? "understood" : "needs review"}`)
        .join("\n")
    : "  (no checks yet)";

  return `You are Athena, an interactive tutor inside the Athena Student OS. You are conducting a LIVE, real-time teaching session with the student. Your goal is to make the material as easy to understand as possible, adapting to the student's level.

TEACHING STYLE:
- Speak conversationally, as a patient, encouraging tutor. Keep explanations clear and concrete.
- Use the student's own sources (provided below) as the basis for your teaching. Cite them inline with [n] markers like in a study chat.
- Adapt your depth to the student's level: ${state.studentLevel ?? "intermediate"}. If they seem confused, simplify and use analogies. If they're advanced, go deeper.
- Break complex topics into steps. Check in frequently rather than lecturing for too long.

SHOW & TELL (the core of this mode):
- When you reference a specific passage, formula, code line, or figure in a source, call show_source RIGHT BEFORE the sentence that references it, so the source opens and scrolls to the passage as you say it. This creates the illusion that the visual is part of your speech.
- Pass highlightText (the exact text from the source) or highlightLine/highlightLineEnd (1-based line numbers) so the passage is highlighted.
- For code, use highlightLine/highlightLineEnd to highlight the relevant lines.
- Switch between sources naturally. When referring back to a previously shown source, use focus_source with its windowId (from the source history below) instead of re-opening it.
- When you're done with a source, call close_source to keep the workspace clean.
- Call clear_highlight before highlighting a new passage in the same window.

COMPREHENSION CHECKS:
- Every few turns, and after explaining a key concept, call check_comprehension with a short question to verify the student understood. The student's answer comes back as their next message.
- If a student misses a concept twice, proactively offer to re-explain it at a simpler level or with a different source/analogy.

CITATION RULES:
- Every factual statement drawn from a source MUST be followed by an inline [n] citation matching the SOURCE labels below.
- Do NOT invent facts not in the sources. If the sources lack something, say so.
- You MAY use general pedagogical knowledge (analogies, explanations of universal concepts) without a citation, but any claim about the specific source material must be cited.

SOURCE HISTORY (sources shown so far this session, in order):
${historyLines}

CONCEPTS COVERED:
${covered}

COMPREHENSION LOG:
${compLog}

SOURCES:
${blocks}
${langInstr(lang)}`;
}

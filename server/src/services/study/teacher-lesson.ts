// ===== Interactive Teacher: lesson planning, assessment and export =====
// The "brains" behind Teach Me that are not part of the streaming turn:
//   - generateLessonPlan: a JSON agenda (objectives + key concepts + checks)
//   - assessComprehension: grades a student's answer to a comprehension check
//   - generateSessionTitle: a short, human title for the session list
//   - lessonSummaryMarkdown / lessonFlashcards: lesson → study artifacts
//
// The prompt-building and result-normalizing helpers are pure so they can be
// unit-tested without an LLM.

import type { LlmModel } from "multi-llm-ts";
import { generateJson, generateText } from "./llm-json";
import { budgetSources, langInstr, type GroundedSource, type StudyLanguage } from "./prompts";
import {
  masteryBuckets,
  openMisconceptions,
  passRate,
  type LessonPlan,
  type TeacherSessionState,
  type TeachingStyle,
} from "./teacher-prompt";

// ---------- lesson plan ----------

export function lessonPlanPrompt(
  sources: GroundedSource[],
  opts: { studentLevel: string; focus?: string; language?: StudyLanguage }
): string {
  const budgeted = budgetSources(sources, 24000);
  const blocks = budgeted
    .map((s) => `--- SOURCE [${s.index}] (${s.kind}: ${s.name}) ---\n${s.text}\n`)
    .join("\n");
  return `Design a short tutoring lesson for a ${opts.studentLevel} student, based ONLY on the sources below.
${opts.focus ? `The student specifically wants to learn: ${opts.focus}\n` : ""}
Rules:
- 2-4 objectives, phrased as what the student will be able to do.
- 3-6 key concepts, ordered so each builds on the previous one. Use the wording of the sources.
- One comprehension check question per key concept, answerable from the sources in a sentence or two.
- estimatedTurns: a realistic number of exchanges (3-15).
- suggestedSources: the 1-based SOURCE numbers to start from, best first.
- title: at most 6 words, no quotes.

SOURCES:
${blocks}
${langInstr(opts.language)}`;
}

export function lessonPlanSchemaHint(): string {
  return 'Schema: { "title": string, "objectives": string[], "keyConcepts": string[], "checks": [{ "concept": string, "question": string }], "estimatedTurns": number, "suggestedSources": number[] }';
}

/** Coerce a raw model response into a LessonPlan (or null if unusable). */
export function normalizeLessonPlan(raw: unknown): LessonPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [];
  const objectives = strings(r.objectives);
  const keyConcepts = strings(r.keyConcepts);
  if (keyConcepts.length === 0) return null;
  const checks = Array.isArray(r.checks)
    ? r.checks
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          return { concept: String(o.concept ?? "").trim(), question: String(o.question ?? "").trim() };
        })
        .filter((c) => c.concept && c.question)
        .slice(0, 12)
    : [];
  const turns = Number(r.estimatedTurns);
  return {
    title: String(r.title ?? "").trim().slice(0, 80) || keyConcepts[0].slice(0, 80),
    objectives,
    keyConcepts,
    checks,
    estimatedTurns: Number.isFinite(turns) && turns > 0 ? Math.min(30, Math.round(turns)) : undefined,
    suggestedSources: Array.isArray(r.suggestedSources)
      ? r.suggestedSources.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 10)
      : undefined,
  };
}

export async function generateLessonPlan(
  model: LlmModel,
  sources: GroundedSource[],
  opts: { studentLevel: string; focus?: string; language?: StudyLanguage }
): Promise<LessonPlan | null> {
  const raw = await generateJson<unknown>(model, lessonPlanPrompt(sources, opts), lessonPlanSchemaHint());
  return normalizeLessonPlan(raw);
}

// ---------- comprehension assessment ----------

export interface AssessmentInput {
  question: string;
  expectedConcept?: string;
  answer: string;
  /** Relevant source text (already trimmed) to ground the grading. */
  sourceText?: string;
  teachingStyle?: TeachingStyle;
  language?: StudyLanguage;
}

export interface AssessmentResult {
  passed: boolean;
  /** 0-100 confidence that the student understands the concept. */
  score: number;
  /** One or two sentences addressed to the student. */
  feedback: string;
  misconception?: string;
}

export function assessmentPrompt(input: AssessmentInput): string {
  const socratic = input.teachingStyle === "socratic";
  return `Grade a tutoring comprehension check. Be LENIENT about wording, spelling and completeness: the student is talking, not writing an exam. Judge whether they show real understanding of the concept.

${socratic ? "This is a Socratic lesson: reward partial progress. If the student is reasoning in the right direction, pass them even if the final answer is incomplete.\n" : ""}Pass when the core idea is right, even if phrased loosely or missing detail.
Fail when the answer is empty, evasive ("I don't know", "no idea"), off-topic, or states something factually wrong about the concept.
If it fails, describe the specific misconception in one short clause.
Feedback: at most 2 sentences, addressed to the student ("you"), encouraging and concrete.

Concept being tested: ${input.expectedConcept || "(not specified — infer from the question)"}
Question: ${input.question}
Student's answer: ${input.answer}
${input.sourceText ? `\nReference material (ground truth):\n${input.sourceText.slice(0, 6000)}\n` : ""}${langInstr(input.language)}`;
}

export function assessmentSchemaHint(): string {
  return 'Schema: { "passed": boolean, "score": number (0-100), "feedback": string, "misconception": string | null }';
}

/** Coerce a raw model response into an AssessmentResult. */
export function normalizeAssessment(raw: unknown): AssessmentResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawScore = Number(r.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : NaN;
  // `passed` wins when present; otherwise fall back to the score.
  const passed =
    typeof r.passed === "boolean"
      ? r.passed
      : typeof r.passed === "string"
        ? /^(true|yes|pass(ed)?)$/i.test(r.passed.trim())
        : Number.isFinite(score)
          ? score >= 60
          : false;
  const misconception = typeof r.misconception === "string" ? r.misconception.trim() : "";
  return {
    passed,
    score: Number.isFinite(score) ? score : passed ? 80 : 30,
    feedback: String(r.feedback ?? "").trim().slice(0, 400) ||
      (passed ? "That's right — nice work." : "Not quite — let's go over that again."),
    misconception: !passed && misconception && !/^(none|n\/a|null)$/i.test(misconception) ? misconception : undefined,
  };
}

/** Grade a student's answer with the LLM. Falls back to a heuristic on failure. */
export async function assessComprehension(
  model: LlmModel,
  input: AssessmentInput
): Promise<AssessmentResult> {
  const trimmed = input.answer.trim();
  if (!trimmed || /^(i (don'?t|do not) know|no idea|dunno|idk|\?+)$/i.test(trimmed)) {
    return {
      passed: false,
      score: 0,
      feedback: "No problem — let's walk through it again together.",
      misconception: "Could not answer the check at all.",
    };
  }
  const raw = await generateJson<unknown>(model, assessmentPrompt(input), assessmentSchemaHint());
  return normalizeAssessment(raw);
}

// ---------- session title ----------

export async function generateSessionTitle(
  model: LlmModel,
  firstExchange: { question: string; answer: string },
  language?: StudyLanguage
): Promise<string> {
  const out = await generateText(
    model,
    `Student asked: ${firstExchange.question.slice(0, 500)}\n\nTutor answered: ${firstExchange.answer.slice(0, 1500)}\n\nTitle:`,
    `Write a title of at most 6 words for this tutoring session. Topic only — no quotes, no trailing period, no "lesson"/"session" filler.${langInstr(language)}`
  );
  return out.replace(/^["'\s]+|["'.\s]+$/g, "").split("\n")[0].slice(0, 80);
}

// ---------- export artifacts ----------

export interface LessonExportContext {
  title: string;
  state: TeacherSessionState;
  messages: { role: "user" | "assistant"; content: string }[];
  sources: { name: string; kind: string }[];
}

/** Build a study-note style markdown recap of the lesson (no LLM needed). */
export function lessonSummaryMarkdown(ctx: LessonExportContext): string {
  const { state } = ctx;
  const buckets = masteryBuckets(state);
  const misconceptions = openMisconceptions(state);
  const plan = state.lessonPlan;

  const lines: string[] = [`# ${ctx.title}`, ""];
  if (plan?.objectives?.length) {
    lines.push("## Objectives", ...plan.objectives.map((o) => `- ${o}`), "");
  }
  if (state.coveredConcepts?.length) {
    lines.push("## Concepts covered", "");
    for (const concept of state.coveredConcepts) {
      const entry = state.mastery?.[concept];
      const status = !entry || entry.checksTotal === 0
        ? "not checked"
        : `${Math.round(passRate(entry) * 100)}% (${entry.checksPassed}/${entry.checksTotal} checks)`;
      lines.push(`- **${concept}** — ${status}`);
    }
    lines.push("");
  }
  if (buckets.needingReview.length) {
    lines.push("## Needs review", ...buckets.needingReview.map((c) => `- ${c}`), "");
  }
  if (misconceptions.length) {
    lines.push(
      "## Misconceptions to fix",
      ...misconceptions.map((m) => `- **${m.concept}**: ${m.misconception}`),
      ""
    );
  }
  const quotes = collectQuotes(ctx.messages).slice(0, 8);
  if (quotes.length) {
    lines.push("## Key quotes from the sources", ...quotes.map((q) => `> ${q}`), "");
  }
  const checks = (state.comprehensionLog ?? []).filter((c) => c.question);
  if (checks.length) {
    lines.push("## Comprehension checks", "");
    for (const c of checks.slice(-12)) {
      lines.push(`- ${c.passed ? "✔" : "✘"} **${c.concept}** — ${c.question}`);
      if (c.answer) lines.push(`  - Your answer: ${c.answer}`);
      if (c.feedback) lines.push(`  - Feedback: ${c.feedback}`);
    }
    lines.push("");
  }
  if (ctx.sources.length) {
    lines.push("## Sources", ...ctx.sources.map((s) => `- ${s.name} (${s.kind})`), "");
  }
  return lines.join("\n");
}

/** Pull blockquoted / quoted source passages out of the transcript. */
export function collectQuotes(messages: { role: string; content: string }[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const line of m.content.split("\n")) {
      const bq = line.match(/^>\s*(.+)$/);
      if (bq) {
        const text = bq[1].replace(/\s*\[\d+\]\s*$/, "").trim();
        if (text.length > 20 && !out.includes(text)) out.push(text);
      }
    }
  }
  return out;
}

export function lessonFlashcardsPrompt(ctx: LessonExportContext): string {
  const buckets = masteryBuckets(ctx.state);
  const weak = [...buckets.needingReview, ...buckets.toCover];
  const focus = weak.length ? weak : (ctx.state.coveredConcepts ?? []);
  const transcript = ctx.messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n\n")
    .slice(-14000);
  return `Create flashcards from this tutoring lesson. Prioritise the concepts the student struggled with, in this order: ${
    focus.join(", ") || "(all concepts in the transcript)"
  }.

Rules:
- One idea per card. Front = a question, back = a complete but short answer.
- 6-12 cards. Skip anything not actually taught in the transcript.
- Use the lesson's own wording and examples.

LESSON TRANSCRIPT:
${transcript}`;
}

export function lessonFlashcardsSchemaHint(): string {
  return 'Schema: { "cards": [{ "front": string, "back": string }] }';
}

/** Coerce a raw model response into flashcards. */
export function normalizeFlashcards(raw: unknown): { front: string; back: string }[] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.cards) ? r.cards : Array.isArray(raw) ? (raw as unknown[]) : [];
  return list
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { front: String(o.front ?? "").trim(), back: String(o.back ?? "").trim() };
    })
    .filter((c) => c.front && c.back)
    .slice(0, 30);
}

/** Concepts worth reviewing later, weakest first. */
export function weakConcepts(state: TeacherSessionState): string[] {
  const buckets = masteryBuckets(state);
  const scored = buckets.needingReview.map((c) => ({ c, rate: passRate(state.mastery?.[c]) }));
  scored.sort((a, b) => a.rate - b.rate);
  return scored.map((s) => s.c);
}

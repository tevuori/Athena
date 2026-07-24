// ===== Study Hub prompt builders =====
// Focused prompts for each study workflow. Used by routes/study.ts.

export interface FlashcardSpec {
  front: string;
  back: string;
}

export interface QuizQuestionSpec {
  id: number;
  type: "mcq" | "short";
  prompt: string;
  options?: string[]; // for mcq
  answer: string; // model answer (for short) or correct option text (for mcq)
}

export interface SyllabusTaskSpec {
  title: string;
  dueDate?: string | null; // ISO date or null
  priority?: "LOW" | "MEDIUM" | "HIGH";
}

export function flashcardsPrompt(sourceText: string, count: number, mode: string): string {
  const modeInstr =
    mode === "cloze"
      ? 'Cloze deletion style: the "front" is a sentence with a key term replaced by "_____", and the "back" is the missing term. Generate cards that test recall of specific terms within context.'
      : mode === "concept"
      ? 'Focus on definitions and concepts ("What is X?" / "Define X").'
      : mode === "factual"
      ? "Focus on specific facts and details (dates, numbers, names, properties)."
      : "Use a balance of concept definitions and specific facts.";
  return `Generate ${count} flashcards from the study material below. Each card must have a concise question on the front and a clear, correct answer on the back. ${modeInstr}

Return JSON: { "cards": [ { "front": "...", "back": "..." }, ... ] }

Study material:
"""
${sourceText}
"""`;
}

export function flashcardsSchemaHint(): string {
  return 'Schema: { "cards": [ { "front": string, "back": string } ] }';
}

export function summarizePrompt(sourceText: string, mode: string): string {
  const modeInstr =
    mode === "tldr"
      ? "a 2-3 sentence TL;DR"
      : mode === "outline"
      ? "a structured outline with headings and bullet points"
      : "5-8 key bullet points";
  return `Summarize the material below as ${modeInstr}. Use clear Markdown formatting. Be accurate and do not invent information not present in the source.

Material:
"""
${sourceText}
"""`;
}

export function explainPrompt(sourceText: string, depth: string): string {
  const depthInstr =
    depth === "eli5"
      ? "as if explaining to a 5-year-old (simple words, analogies, no jargon)"
      : depth === "expert"
      ? "at an advanced/expert level with technical depth, edge cases, and nuance"
      : "at a standard undergraduate level — clear and thorough but not overly simplified";
  return `Explain the following topic/material ${depthInstr}. Use Markdown with headings and examples where helpful.

Material:
"""
${sourceText}
"""`;
}

export function studyGuidePrompt(notes: { title: string; content: string }[]): string {
  const combined = notes
    .map((n) => `### ${n.title}\n\n${n.content}`)
    .join("\n\n---\n\n");
  return `Create a comprehensive study guide / cheat sheet that consolidates the following notes. Organize by topic, include key definitions, formulas, and important facts. Use clear Markdown with headings, bullet points, and tables where useful. Do not invent information not present in the sources.

Notes:
"""
${combined}
"""`;
}

export function syllabusTasksPrompt(sourceText: string): string {
  return `Extract actionable study tasks (assignments, readings, exams, deadlines) from the material below. For each task, provide a short title, an optional due date (ISO format YYYY-MM-DD if explicitly mentioned, otherwise null), and a priority.

Return JSON: { "tasks": [ { "title": "...", "dueDate": "2025-01-31" | null, "priority": "LOW" | "MEDIUM" | "HIGH" }, ... ] }

Material:
"""
${sourceText}
"""`;
}

export function syllabusTasksSchemaHint(): string {
  return 'Schema: { "tasks": [ { "title": string, "dueDate": string|null, "priority": "LOW"|"MEDIUM"|"HIGH" } ] }';
}

export function quizGeneratePrompt(
  sourceText: string,
  count: number,
  types: string[]
): string {
  const typeInstr = types.includes("mcq") && types.includes("short")
    ? "a mix of multiple-choice (mcq) and short-answer (short) questions"
    : types.includes("mcq")
    ? "only multiple-choice (mcq) questions"
    : types.includes("short")
    ? "only short-answer (short) questions"
    : "a mix of multiple-choice (mcq) and short-answer (short) questions";
  return `Generate ${count} quiz questions from the study material below. Use ${typeInstr}. For mcq questions, provide 4 options and the correct answer (the exact text of the correct option). For short questions, provide the model answer. Each question must have a unique sequential id starting at 1.

Return JSON: { "questions": [ { "id": 1, "type": "mcq", "prompt": "...", "options": ["a","b","c","d"], "answer": "b" }, { "id": 2, "type": "short", "prompt": "...", "answer": "..." } ] }

Study material:
"""
${sourceText}
"""`;
}

export function quizGenerateSchemaHint(): string {
  return 'Schema: { "questions": [ { "id": number, "type": "mcq"|"short", "prompt": string, "options"?: string[], "answer": string } ] }';
}

export function quizGradePrompt(
  sourceText: string,
  question: { type: string; prompt: string; answer: string },
  userAnswer: string
): string {
  return `You are grading a quiz answer. Determine if the student's answer is correct relative to the model answer. Be lenient on wording but strict on correctness.

Question: ${question.prompt}
Model answer: ${question.answer}
Student's answer: ${userAnswer}

Return JSON: { "correct": boolean, "explanation": "brief explanation of why it is correct or incorrect", "modelAnswer": "the ideal answer" }`;
}

export function quizGradeSchemaHint(): string {
  return 'Schema: { "correct": boolean, "explanation": string, "modelAnswer": string }';
}

// ===== Notetaking (from URL / PDF) =====

export type NoteStyle = "cornell" | "outline" | "summary" | "bullets";

export function notetakingPrompt(sourceText: string, style: NoteStyle, sourceLabel: string): string {
  const styleInstr =
    style === "cornell"
      ? "Cornell notes format: organize into 'Cues / Questions' (left), 'Notes' (right, main body with bullet points), and a 'Summary' at the bottom (2-3 sentences). Use a Markdown structure with these sections clearly labeled."
      : style === "outline"
      ? "A structured outline with hierarchical headings (##, ###) and bullet points under each section."
      : style === "summary"
      ? "A concise summary: a 2-3 sentence overview followed by the key points as bullets."
      : "Clear bullet-point notes organized by topic with ## headings.";
  return `Take structured notes from the source material below. Use ${styleInstr}. Be accurate — do not invent information not present in the source. Use Markdown formatting.

Source: ${sourceLabel}

Material:
"""
${sourceText}
"""`;
}

// ===== Research (multi-step web research with citations) =====

export function researchSynthesizePrompt(
  query: string,
  sources: { index: number; title: string; url: string; content: string }[]
): string {
  const sourcesBlock = sources
    .map(
      (s) =>
        `--- SOURCE [${s.index}] ---\nTitle: ${s.title}\nURL: ${s.url}\n\n${s.content}\n`
    )
    .join("\n");
  return `You are a research assistant. Using ONLY the sources provided below, write a clear, well-organized answer to the user's question. Cite sources inline using [1], [2], etc. matching the SOURCE labels. If the sources don't contain enough information to answer fully, say so explicitly. Do not invent facts. Use Markdown formatting with headings where helpful. Include a "## Sources" section at the end listing each cited source as \`[n] Title — URL\`.

User's question: ${query}

${sourcesBlock}`;
}

export function researchRefinePrompt(originalQuery: string): string {
  return `The user wants to research: "${originalQuery}". Generate ONE alternative search query that would find complementary or more specific information (e.g. a different phrasing, a sub-topic, or a recent-development angle). Return ONLY the query text, no quotes, no explanation.`;
}

// ===== Source-grounded Q&A (NotebookLM-style) =====
// Sources are injected as numbered SOURCE blocks so the model can cite inline
// with [n] markers that the client renders as clickable citation chips.

export interface GroundedSource {
  index: number;
  name: string;
  /** "note" | "file" | "paste" | "moodle" | "url" — used by the client to open. */
  kind: string;
  /** Note/file id, "paste", or the URL. */
  refId: string;
  text: string;
}

/** Cap the total injected source text to protect context windows. Each source
 *  is truncated proportionally so no single source dominates. */
export function budgetSources(sources: GroundedSource[], totalBudget = 60000): GroundedSource[] {
  const total = sources.reduce((s, x) => s + x.text.length, 0);
  if (total <= totalBudget) return sources;
  const scale = totalBudget / total;
  return sources.map((s) => {
    const cap = Math.max(2000, Math.floor(s.text.length * scale));
    return {
      ...s,
      text: s.text.length > cap ? s.text.slice(0, cap) + "\n\n[…truncated…]" : s.text,
    };
  });
}

export function groundedQaSystemPrompt(sources: GroundedSource[]): string {
  const budgeted = budgetSources(sources);
  const blocks = budgeted
    .map(
      (s) =>
        `--- SOURCE [${s.index}] (${s.kind}: ${s.name}) ---\n${s.text}\n`
    )
    .join("\n");
  return `You are Athena, a study assistant inside the Athena Student OS. You answer the student's questions using ONLY the sources provided below. Be clear, accurate, and helpful, and use Markdown formatting with headings and lists where helpful.

CRITICAL CITATION RULES:
- Every factual statement or claim MUST be followed by an inline citation matching the source it came from, using the form [1], [2], etc. matching the SOURCE labels above.
- If a statement draws on multiple sources, cite all of them: [1][3].
- If the sources do not contain enough information to answer fully, say so explicitly and do NOT invent or assume facts not present in the sources.
- Do not use outside knowledge to fill gaps — only the provided sources.
- At the end of your answer, include a "## Sources" section listing each cited source as \`[n] <name>\` (one per line). Only list sources you actually cited.

SOURCES:
${blocks}`;
}

// ===== Podcast / audio overview script =====

export function podcastScriptPrompt(
  sources: { index: number; name: string; text: string }[],
  host1Label: string,
  host2Label: string
): string {
  const budgeted = budgetSources(
    sources.map((s) => ({ ...s, kind: "source", refId: String(s.index) })),
    50000
  );
  const blocks = budgeted
    .map((s) => `--- SOURCE [${s.index}]: ${s.name} ---\n${s.text}\n`)
    .join("\n");
  return `You are writing an engaging, conversational podcast script that gives an audio overview of the study material below. Two hosts discuss the material in a natural, lively way — like a popular educational podcast.

FORMAT RULES (follow exactly so a text-to-speech engine can read it):
- Each spoken line MUST start with the host label followed by a colon, e.g. "${host1Label}: ..." or "${host2Label}: ...".
- Alternate between the two hosts. Keep each turn to 1-3 sentences.
- Do NOT include stage directions, sound effects, parentheses, or markdown headings inside the dialogue. Only \`Host: spoken text\` lines.
- Cover the key concepts, important details, and a couple of concrete examples from the sources. Make it feel like a real conversation: ask each other questions, react, summarize.
- Aim for roughly 5-8 minutes of spoken audio (about 60-100 short lines total).
- Stay faithful to the sources — do not invent facts. If something is unclear in the sources, the hosts can acknowledge it.
- Start with a brief friendly intro (host 1 welcomes listeners and introduces the topic) and end with a short recap + sign-off.

SOURCES:
${blocks}

Write the full script now, starting with "${host1Label}:".`;
}

// ===== Citation-aware variants for existing study materials =====

export function studyGuideCitedPrompt(
  notes: { index: number; name: string; content: string }[]
): string {
  const combined = notes
    .map((n) => `### SOURCE [${n.index}]: ${n.name}\n\n${n.content}`)
    .join("\n\n---\n\n");
  return `Create a comprehensive study guide / cheat sheet that consolidates the following sources. Organize by topic, include key definitions, formulas, and important facts. Use clear Markdown with headings, bullet points, and tables where useful.

CITATION RULES:
- Do not invent information not present in the sources.
- After key facts or section content, cite the source(s) they came from as inline [n] markers matching the SOURCE labels above.
- Include a "## Sources" section at the end listing each cited source as \`[n] <name>\`.

Sources:
"""
${combined}
"""`;
}

export function summarizeCitedPrompt(sourceText: string, mode: string, sourceLabel: string): string {
  const modeInstr =
    mode === "tldr"
      ? "a 2-3 sentence TL;DR"
      : mode === "outline"
      ? "a structured outline with headings and bullet points"
      : "5-8 key bullet points";
  return `Summarize the material below as ${modeInstr}. Use clear Markdown formatting. Be accurate and do not invent information not present in the source. After key points, cite the source as [1] (there is a single source: ${sourceLabel}). Include a "## Sources" section at the end: \`[1] ${sourceLabel}\`.

Material:
"""
${sourceText}
"""`;
}

export function explainCitedPrompt(sourceText: string, depth: string, sourceLabel: string): string {
  const depthInstr =
    depth === "eli5"
      ? "as if explaining to a 5-year-old (simple words, analogies, no jargon)"
      : depth === "expert"
      ? "at an advanced/expert level with technical depth, edge cases, and nuance"
      : "at a standard undergraduate level — clear and thorough but not overly simplified";
  return `Explain the following topic/material ${depthInstr}. Use Markdown with headings and examples where helpful. Do not invent information not present in the source. After key statements, cite the source as [1] (single source: ${sourceLabel}). Include a "## Sources" section at the end: \`[1] ${sourceLabel}\`.

Material:
"""
${sourceText}
"""`;
}

export interface CitedFlashcardSpec {
  front: string;
  back: string;
  /** 1-based source index the card was derived from. */
  source?: number;
}

export function flashcardsCitedPrompt(
  sources: { index: number; name: string; text: string }[],
  count: number,
  mode: string
): string {
  const modeInstr =
    mode === "cloze"
      ? 'Cloze deletion style: the "front" is a sentence with a key term replaced by "_____", and the "back" is the missing term. Generate cards that test recall of specific terms within context.'
      : mode === "concept"
      ? 'Focus on definitions and concepts ("What is X?" / "Define X").'
      : mode === "factual"
      ? "Focus on specific facts and details (dates, numbers, names, properties)."
      : "Use a balance of concept definitions and specific facts.";
  const blocks = sources
    .map((s) => `--- SOURCE [${s.index}]: ${s.name} ---\n${s.text}\n`)
    .join("\n");
  return `Generate ${count} flashcards from the study material below. Each card must have a concise question on the front and a clear, correct answer on the back. ${modeInstr} For each card, set "source" to the 1-based index of the SOURCE it was derived from.

Return JSON: { "cards": [ { "front": "...", "back": "...", "source": 1 }, ... ] }

Study material:
${blocks}`;
}

export function flashcardsCitedSchemaHint(): string {
  return 'Schema: { "cards": [ { "front": string, "back": string, "source"?: number } ] }';
}

export function quizCitedPrompt(
  sources: { index: number; name: string; text: string }[],
  count: number,
  types: string[]
): string {
  const typeInstr = types.includes("mcq") && types.includes("short")
    ? "a mix of multiple-choice (mcq) and short-answer (short) questions"
    : types.includes("mcq")
    ? "only multiple-choice (mcq) questions"
    : types.includes("short")
    ? "only short-answer (short) questions"
    : "a mix of multiple-choice (mcq) and short-answer (short) questions";
  const blocks = sources
    .map((s) => `--- SOURCE [${s.index}]: ${s.name} ---\n${s.text}\n`)
    .join("\n");
  return `Generate ${count} quiz questions from the study material below. Use ${typeInstr}. For mcq questions, provide 4 options and the correct answer (the exact text of the correct option). For short questions, provide the model answer. Each question must have a unique sequential id starting at 1. After each question's prompt, append the source citation in the form "[n]" matching the SOURCE the question is drawn from.

Return JSON: { "questions": [ { "id": 1, "type": "mcq", "prompt": "... [1]", "options": ["a","b","c","d"], "answer": "b" }, { "id": 2, "type": "short", "prompt": "... [2]", "answer": "..." } ] }

Study material:
${blocks}`;
}

export function quizCitedSchemaHint(): string {
  return 'Schema: { "questions": [ { "id": number, "type": "mcq"|"short", "prompt": string, "options"?: string[], "answer": string } ] }';
}

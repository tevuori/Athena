// ===== AI Study Hub routes =====
// Purpose-built AI study workflows on top of the existing Athena LLM infra.
// Reuses getUserConfig/buildModel (per-user or server-wide fallback LLM).

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { getUserConfig, buildModel, isLlmConfiguredFor } from "../services/athena/llm";
import { resolveSource, type SourceDescriptor } from "../services/study/source";
import { generateJson, generateText } from "../services/study/llm-json";
import {
  flashcardsPrompt,
  flashcardsSchemaHint,
  summarizePrompt,
  explainPrompt,
  studyGuidePrompt,
  syllabusTasksPrompt,
  syllabusTasksSchemaHint,
  quizGeneratePrompt,
  quizGenerateSchemaHint,
  quizGradePrompt,
  quizGradeSchemaHint,
  flashcardsCitedPrompt,
  flashcardsCitedSchemaHint,
  summarizeCitedPrompt,
  explainCitedPrompt,
  studyGuideCitedPrompt,
  type FlashcardSpec,
  type QuizQuestionSpec,
  type SyllabusTaskSpec,
  type CitedFlashcardSpec,
} from "../services/study/prompts";
import { createQuiz, getQuiz, deleteQuiz, type StoredQuizQuestion } from "../services/study/quiz-store";
import { logSessionSafe } from "../services/study/logSession";

const study = new Hono();
study.use("*", authMiddleware);

const sourceSchema = z.object({
  kind: z.enum(["note", "file", "paste", "moodle"]),
  id: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  name: z.string().optional(),
});

/** Resolve the user's LLM or return a 400 if unconfigured. */
async function loadModel(c: any, userId: string) {
  const configured = await isLlmConfiguredFor(userId);
  if (!configured) {
    return {
      error: c.json(
        { error: "No AI provider configured. Add an API key in Settings → AI." },
        400
      ),
    } as const;
  }
  const cfg = await getUserConfig(userId);
  return { model: buildModel(cfg) } as const;
}

// ===== Generate Flashcards =====
const flashcardsSchema = z.object({
  source: sourceSchema,
  deckName: z.string().optional(),
  deckColor: z.string().optional(),
  count: z.number().int().min(1).max(40).optional().default(10),
  mode: z.enum(["concept", "factual", "mixed", "cloze"]).optional().default("mixed"),
  /** If true, create the deck + cards in DB. If false, just return the cards. */
  create: z.boolean().optional().default(true),
});

study.post("/flashcards", zValidator("json", flashcardsSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");

  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  let resolved;
  try {
    resolved = await resolveSource(userId, body.source as SourceDescriptor);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Source error" }, 400);
  }

  let result;
  try {
    result = await generateJson<{ cards: CitedFlashcardSpec[] }>(
      loaded.model,
      flashcardsCitedPrompt([{ index: 1, name: resolved.name, text: resolved.text }], body.count, body.mode),
      flashcardsCitedSchemaHint()
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Generation failed" }, 502);
  }

  const cards = (result.cards ?? []).filter(
    (card) => card.front?.trim() && card.back?.trim()
  );
  if (cards.length === 0) {
    return c.json({ error: "The AI did not generate any valid flashcards." }, 502);
  }

  const deckName = body.deckName?.trim() || `Flashcards: ${resolved.name}`;
  let deckId: string | null = null;
  if (body.create) {
    const deck = await prisma.flashcardDeck.create({
      data: {
        name: deckName.slice(0, 100),
        color: body.deckColor ?? "#6366f1",
        userId,
      },
    });
    deckId = deck.id;
    await prisma.flashcard.createMany({
      data: cards.map((card) => ({
        front: String(card.front).slice(0, 2000),
        back: String(card.back).slice(0, 2000),
        sourceRef: resolved.name.slice(0, 200),
        deckId: deck.id,
      })),
    });
  }

  const sessionId = await logSessionSafe(userId, "flashcards", deckName, resolved.ref, {
    deckId,
    cardCount: cards.length,
    create: body.create,
  });

  return c.json({
    deckId,
    deckName,
    cards: cards.map((card) => ({ front: card.front, back: card.back })),
    sessionId,
    truncated: resolved.truncated,
  });
});

// ===== Summarize =====
const summarizeSchema = z.object({
  source: sourceSchema,
  mode: z.enum(["tldr", "outline", "keypoints"]).optional().default("keypoints"),
  saveAsNote: z.boolean().optional().default(true),
  noteTitle: z.string().optional(),
});

study.post("/summarize", zValidator("json", summarizeSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  let resolved;
  try {
    resolved = await resolveSource(userId, body.source as SourceDescriptor);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Source error" }, 400);
  }

  let summary: string;
  try {
    summary = await generateText(
      loaded.model,
      summarizeCitedPrompt(resolved.text, body.mode, resolved.name),
      "You are a study assistant. Summarize accurately in clear Markdown. Do not invent information."
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Generation failed" }, 502);
  }

  let noteId: string | null = null;
  if (body.saveAsNote && summary.trim()) {
    const title = body.noteTitle?.trim() || `Summary: ${resolved.name}`;
    const note = await prisma.note.create({
      data: {
        userId,
        title: title.slice(0, 200),
        content: summary,
        tags: "summary,ai",
      },
    });
    noteId = note.id;
  }

  const sessionId = await logSessionSafe(userId, "summary", `Summary: ${resolved.name}`, resolved.ref, {
    mode: body.mode,
    noteId,
  });

  return c.json({ summary, noteId, sessionId, truncated: resolved.truncated });
});

// ===== Explain =====
const explainSchema = z.object({
  source: sourceSchema,
  depth: z.enum(["eli5", "standard", "expert"]).optional().default("standard"),
  saveAsNote: z.boolean().optional().default(true),
  noteTitle: z.string().optional(),
});

study.post("/explain", zValidator("json", explainSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  let resolved;
  try {
    resolved = await resolveSource(userId, body.source as SourceDescriptor);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Source error" }, 400);
  }

  let explanation: string;
  try {
    explanation = await generateText(
      loaded.model,
      explainCitedPrompt(resolved.text, body.depth, resolved.name),
      "You are a study assistant. Explain clearly and accurately in Markdown with examples. Do not invent information."
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Generation failed" }, 502);
  }

  let noteId: string | null = null;
  if (body.saveAsNote && explanation.trim()) {
    const title = body.noteTitle?.trim() || `Explanation: ${resolved.name}`;
    const note = await prisma.note.create({
      data: {
        userId,
        title: title.slice(0, 200),
        content: explanation,
        tags: "explain,ai",
      },
    });
    noteId = note.id;
  }

  const sessionId = await logSessionSafe(userId, "explain", `Explain: ${resolved.name}`, resolved.ref, {
    depth: body.depth,
    noteId,
  });

  return c.json({ explanation, noteId, sessionId, truncated: resolved.truncated });
});

// ===== Study Guide (multiple notes / sources) =====
const studyGuideSchema = z.object({
  noteIds: z.array(z.string()).max(10).optional(),
  sources: z.array(sourceSchema).max(10).optional(),
  saveAsNote: z.boolean().optional().default(true),
  noteTitle: z.string().optional(),
});

study.post("/study-guide", zValidator("json", studyGuideSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  // Build the combined source material from noteIds and/or sources.
  const materials: { title: string; content: string }[] = [];

  if (body.noteIds && body.noteIds.length > 0) {
    const notes = await prisma.note.findMany({
      where: { id: { in: body.noteIds }, userId },
    });
    for (const n of notes) {
      materials.push({ title: n.title, content: n.content });
    }
  }

  if (body.sources && body.sources.length > 0) {
    for (const src of body.sources) {
      try {
        const resolved = await resolveSource(userId, src as SourceDescriptor);
        materials.push({ title: resolved.name, content: resolved.text });
      } catch {
        // Skip sources that can't be resolved.
      }
    }
  }

  if (materials.length === 0) return c.json({ error: "No notes or sources found" }, 404);

  // Number materials 1..N for the cited prompt's [n] markers.
  const citedMaterials = materials.map((m, i) => ({ index: i + 1, name: m.title, content: m.content }));

  let guide: string;
  try {
    guide = await generateText(
      loaded.model,
      studyGuideCitedPrompt(citedMaterials),
      "You are a study assistant. Create a clear, comprehensive study guide in Markdown. Do not invent information."
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Generation failed" }, 502);
  }

  let noteId: string | null = null;
  if (body.saveAsNote && guide.trim()) {
    const title = body.noteTitle?.trim() || "Study Guide";
    const note = await prisma.note.create({
      data: {
        userId,
        title: title.slice(0, 200),
        content: guide,
        tags: "study-guide,ai",
      },
    });
    noteId = note.id;
  }

  const sourceRefs = [
    ...(body.noteIds ?? []),
    ...(body.sources ?? []).map((s) => s.id ?? s.url ?? "paste"),
  ].join(",");

  const sessionId = await logSessionSafe(
    userId,
    "study_guide",
    "Study Guide",
    sourceRefs,
    { noteId, sourceCount: materials.length }
  );

  return c.json({ guide, noteId, sessionId });
});

// ===== Syllabus → Tasks =====
const syllabusSchema = z.object({
  source: sourceSchema,
  create: z.boolean().optional().default(true),
});

study.post("/syllabus-tasks", zValidator("json", syllabusSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  let resolved;
  try {
    resolved = await resolveSource(userId, body.source as SourceDescriptor);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Source error" }, 400);
  }

  let result;
  try {
    result = await generateJson<{ tasks: SyllabusTaskSpec[] }>(
      loaded.model,
      syllabusTasksPrompt(resolved.text),
      syllabusTasksSchemaHint()
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Generation failed" }, 502);
  }

  const tasks = (result.tasks ?? []).filter((t) => t.title?.trim());
  if (tasks.length === 0) {
    return c.json({ error: "The AI did not extract any tasks." }, 502);
  }

  let createdCount = 0;
  if (body.create) {
    for (const t of tasks) {
      const priority = ["LOW", "MEDIUM", "HIGH"].includes(t.priority ?? "")
        ? (t.priority as "LOW" | "MEDIUM" | "HIGH")
        : "MEDIUM";
      let dueDate: Date | null = null;
      if (t.dueDate) {
        const parsed = new Date(t.dueDate);
        if (!isNaN(parsed.getTime())) dueDate = parsed;
      }
      await prisma.task.create({
        data: {
          userId,
          title: String(t.title).slice(0, 200),
          priority,
          dueDate,
        },
      });
      createdCount++;
    }
  }

  const sessionId = await logSessionSafe(userId, "syllabus", "Syllabus → Tasks", resolved.ref, {
    created: createdCount,
    taskCount: tasks.length,
  });

  return c.json({
    tasks: tasks.map((t) => ({
      title: t.title,
      dueDate: t.dueDate ?? null,
      priority: t.priority ?? "MEDIUM",
    })),
    created: createdCount,
    sessionId,
    truncated: resolved.truncated,
  });
});

// ===== Quiz Me: start =====
const quizStartSchema = z.object({
  source: sourceSchema,
  questionCount: z.number().int().min(1).max(20).optional().default(5),
  types: z.array(z.enum(["mcq", "short"])).optional().default(["mcq", "short"]),
});

study.post("/quiz/start", zValidator("json", quizStartSchema), async (c) => {
  const { userId } = c.get("auth");
  const body = c.req.valid("json");
  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  let resolved;
  try {
    resolved = await resolveSource(userId, body.source as SourceDescriptor);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Source error" }, 400);
  }

  let result;
  try {
    result = await generateJson<{ questions: QuizQuestionSpec[] }>(
      loaded.model,
      quizGeneratePrompt(resolved.text, body.questionCount, body.types),
      quizGenerateSchemaHint()
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Generation failed" }, 502);
  }

  const questions = (result.questions ?? []).filter((q) => q.prompt?.trim());
  if (questions.length === 0) {
    return c.json({ error: "The AI did not generate any quiz questions." }, 502);
  }

  const stored: StoredQuizQuestion[] = questions.map((q) => ({
    id: Number(q.id) || 0,
    type: q.type === "mcq" ? "mcq" : "short",
    prompt: String(q.prompt),
    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
    answer: String(q.answer),
  }));

  const quiz = createQuiz(userId, resolved.name, resolved.ref, resolved.text, stored);

  // Return questions WITHOUT answers (so the client can't peek).
  return c.json({
    quizId: quiz.id,
    sourceName: resolved.name,
    truncated: resolved.truncated,
    questions: stored.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
    })),
  });
});

// ===== Quiz Me: fetch a pre-generated quiz (without answers) =====
// Used by the QuizMe component when Athena's start_quiz tool pre-generates
// a quiz on the server and passes the quizId via a client_action payload.
study.get("/quiz/:id", async (c) => {
  const { userId } = c.get("auth");
  const quizId = c.req.param("id");
  const quiz = getQuiz(quizId, userId);
  if (!quiz) return c.json({ error: "Quiz not found or expired. Please restart." }, 404);
  return c.json({
    quizId: quiz.id,
    sourceName: quiz.sourceName,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
    })),
  });
});

// ===== Quiz Me: answer =====
const quizAnswerSchema = z.object({
  questionId: z.number().int(),
  answer: z.string(),
});

study.post("/quiz/:id/answer", zValidator("json", quizAnswerSchema), async (c) => {
  const { userId } = c.get("auth");
  const quizId = c.req.param("id");
  const body = c.req.valid("json");

  const quiz = getQuiz(quizId, userId);
  if (!quiz) return c.json({ error: "Quiz not found or expired. Please restart." }, 404);

  const question = quiz.questions.find((q) => q.id === body.questionId);
  if (!question) return c.json({ error: "Question not found" }, 404);

  const loaded = await loadModel(c, userId);
  if ("error" in loaded) return loaded.error;

  let result;
  try {
    result = await generateJson<{ correct: boolean; explanation: string; modelAnswer: string }>(
      loaded.model,
      quizGradePrompt(quiz.sourceText, question, body.answer),
      quizGradeSchemaHint()
    );
  } catch (e) {
    // Fallback: simple exact-match grading if the LLM fails.
    const correct = body.answer.trim().toLowerCase() === question.answer.trim().toLowerCase();
    return c.json({
      correct,
      explanation: correct ? "Correct." : `The correct answer is: ${question.answer}`,
      modelAnswer: question.answer,
      fallback: true,
    });
  }

  return c.json({
    correct: Boolean(result.correct),
    explanation: String(result.explanation ?? ""),
    modelAnswer: String(result.modelAnswer ?? question.answer),
  });
});

// ===== Quiz Me: finish =====
const quizFinishSchema = z.object({
  score: z.number().int().min(0).max(100),
  correct: z.number().int().min(0),
  total: z.number().int().min(0),
  saveAsNote: z.boolean().optional().default(false),
});

study.post("/quiz/:id/finish", zValidator("json", quizFinishSchema), async (c) => {
  const { userId } = c.get("auth");
  const quizId = c.req.param("id");
  const body = c.req.valid("json");

  const quiz = getQuiz(quizId, userId);
  if (!quiz) return c.json({ error: "Quiz not found or expired" }, 404);

  let noteId: string | null = null;
  if (body.saveAsNote) {
    const content = `# Quiz Results: ${quiz.sourceName}\n\n- Score: **${body.score}%** (${body.correct}/${body.total} correct)\n\n_Generated by Athena Study Hub._`;
    const note = await prisma.note.create({
      data: {
        userId,
        title: `Quiz: ${quiz.sourceName}`.slice(0, 200),
        content,
        tags: "quiz,ai",
      },
    });
    noteId = note.id;
  }

  const sessionId = await logSessionSafe(userId, "quiz", `Quiz: ${quiz.sourceName}`, quiz.sourceRef, {
    score: body.score,
    correct: body.correct,
    total: body.total,
    noteId,
  });

  deleteQuiz(quizId);
  return c.json({ sessionId, noteId });
});

// ===== Recent sessions =====
study.get("/sessions", async (c) => {
  const { userId } = c.get("auth");
  const sessions = await prisma.studySession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      sourceRef: s.sourceRef,
      meta: s.meta ? safeParse(s.meta) : {},
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export default study;

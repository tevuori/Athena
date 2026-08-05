import { describe, expect, it } from "bun:test";
import {
  collectQuotes,
  normalizeAssessment,
  normalizeFlashcards,
  normalizeLessonPlan,
} from "./teacher-lesson";

describe("teacher-lesson normalizers", () => {
  it("normalizes assessment values and uses safe defaults for garbage", () => {
    expect(normalizeAssessment(null)).toEqual({
      passed: false,
      score: 30,
      feedback: "Not quite — let's go over that again.",
      misconception: undefined,
    });

    expect(
      normalizeAssessment({
        passed: "yes",
        score: 140.4,
        feedback: "  Good explanation.  ",
        misconception: "none",
      })
    ).toEqual({
      passed: true,
      score: 100,
      feedback: "Good explanation.",
      misconception: undefined,
    });
  });

  it("normalizes a valid lesson plan and rejects unusable input", () => {
    expect(normalizeLessonPlan("not an object")).toBeNull();
    expect(
      normalizeLessonPlan({
        title: "  Photosynthesis  ",
        objectives: ["Understand light reactions", 42],
        keyConcepts: ["chlorophyll", "  glucose "],
        checks: [
          { concept: "chlorophyll", question: "What absorbs light?" },
          { concept: "", question: "Discard me" },
        ],
        estimatedTurns: 4.6,
        suggestedSources: [1, "2", 0, "bad"],
      })
    ).toEqual({
      title: "Photosynthesis",
      objectives: ["Understand light reactions", "42"],
      keyConcepts: ["chlorophyll", "glucose"],
      checks: [{ concept: "chlorophyll", question: "What absorbs light?" }],
      estimatedTurns: 5,
      suggestedSources: [1, 2],
    });
    expect(normalizeLessonPlan({ title: "Missing concepts", keyConcepts: [] })).toBeNull();
  });

  it("filters malformed flashcards while keeping valid front/back pairs", () => {
    expect(
      normalizeFlashcards({
        cards: [
          { front: "Question", back: "Answer" },
          { front: "Missing back" },
          { front: " ", back: "Also invalid" },
          null,
        ],
      })
    ).toEqual([{ front: "Question", back: "Answer" }]);
    expect(normalizeFlashcards("garbage")).toEqual([]);
  });

  it("collects unique long blockquotes from assistant messages", () => {
    const quote = "Photosynthesis converts light energy into chemical energy.";
    expect(
      collectQuotes([
        { role: "user", content: `> ${quote}` },
        { role: "assistant", content: `> ${quote} [1]\n> Too short` },
        { role: "assistant", content: `> A second source passage with enough length.` },
      ])
    ).toEqual([quote, "A second source passage with enough length."]);
  });
});

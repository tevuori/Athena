import { describe, expect, it } from "bun:test";
import {
  applyAssessmentToState,
  inferAdaptiveLevel,
  masteryBuckets,
  openMisconceptions,
  passRate,
  weakConceptsFallback,
  type TeacherSessionState,
} from "./teacher-prompt";

describe("teacher-prompt mastery helpers", () => {
  it("returns zero for an unasked concept and the correct ratio otherwise", () => {
    expect(passRate(undefined)).toBe(0);
    expect(passRate({ checksTotal: 0, checksPassed: 0 })).toBe(0);
    expect(passRate({ checksTotal: 5, checksPassed: 3 })).toBe(0.6);
  });

  it("places concepts into the implementation's mastery buckets", () => {
    const state: TeacherSessionState = {
      lessonPlan: { title: "Basics", objectives: [], keyConcepts: ["new", "weak", "borderline", "mastered"] },
      mastery: {
        weak: { checksTotal: 5, checksPassed: 2 },
        borderline: { checksTotal: 5, checksPassed: 3 },
        mastered: { checksTotal: 5, checksPassed: 4 },
      },
    };

    expect(masteryBuckets(state)).toEqual({
      toCover: ["new"],
      needingReview: ["weak"],
      mastered: ["mastered"],
    });
  });

  it("applies failing and passing assessments immutably", () => {
    const initial: TeacherSessionState = {
      mastery: { algebra: { checksTotal: 1, checksPassed: 1 } },
      comprehensionLog: [],
      coveredConcepts: [],
    };

    const failed = applyAssessmentToState(initial, {
      concept: "algebra",
      passed: false,
      feedback: "Try again",
      misconception: "Confused variables with constants",
    });
    expect(initial).toEqual({
      mastery: { algebra: { checksTotal: 1, checksPassed: 1 } },
      comprehensionLog: [],
      coveredConcepts: [],
    });
    expect(failed.mastery?.algebra).toMatchObject({
      checksTotal: 2,
      checksPassed: 1,
      misconception: "Confused variables with constants",
    });
    expect(failed.comprehensionLog).toHaveLength(1);
    expect(failed.comprehensionLog?.[0]).toMatchObject({
      concept: "algebra",
      passed: false,
      misconception: "Confused variables with constants",
    });

    const passed = applyAssessmentToState(failed, {
      concept: "algebra",
      passed: true,
      feedback: "Correct",
    });
    expect(passed.mastery?.algebra).toMatchObject({ checksTotal: 3, checksPassed: 2 });
    expect(passed.mastery?.algebra?.misconception).toBeUndefined();
    expect(passed.comprehensionLog?.[1]).toMatchObject({
      concept: "algebra",
      passed: true,
    });
  });

  it("never infers below the explicit student level floor", () => {
    const advanced: TeacherSessionState = {
      studentLevel: "advanced",
      comprehensionLog: [
        { concept: "x", passed: false },
        { concept: "x", passed: false },
        { concept: "x", passed: false },
      ],
    };
    expect(inferAdaptiveLevel(advanced)).toBe("advanced");

    const beginnerCoasting: TeacherSessionState = {
      studentLevel: "beginner",
      comprehensionLog: [
        { concept: "x", passed: true },
        { concept: "x", passed: true },
        { concept: "x", passed: true },
      ],
    };
    expect(inferAdaptiveLevel(beginnerCoasting)).toBe("intermediate");
  });

  it("extracts weak covered concepts and open misconceptions", () => {
    const state: TeacherSessionState = {
      coveredConcepts: ["weak", "mastered", "unchecked"],
      mastery: {
        weak: { checksTotal: 2, checksPassed: 0, misconception: "Reversed the relationship" },
        mastered: { checksTotal: 5, checksPassed: 5, misconception: "Old mistake" },
        unchecked: { checksTotal: 0, checksPassed: 0 },
      },
    };

    expect(weakConceptsFallback(state)).toEqual(["weak", "unchecked"]);
    expect(openMisconceptions(state)).toEqual([
      { concept: "weak", misconception: "Reversed the relationship" },
    ]);
  });
});

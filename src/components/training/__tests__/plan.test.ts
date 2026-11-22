import { describe, expect, it } from "vitest";
import { requestedExerciseIds, trainingBlockHref } from "../plan";
import type { TrainingBlock } from "../../../lib/training/recommend";

describe("recommended session boundaries", () => {
  it("opens exactly the recommended set in its supplied order", () => {
    const block: TrainingBlock = { id: "review", kind: "due_review", area: "review", title: "Review", minutes: 6, mode: "review", exerciseIds: ["second", "first"], reasons: [] };
    const url = new URL(trainingBlockHref(block)!, "https://example.test");
    expect(url.searchParams.get("mode")).toBe("review");
    expect(requestedExerciseIds(url.searchParams.get("ids")!, new Set(["first", "second", "third"]))).toEqual(["second", "first"]);
  });
  it("omits removed or unverified exercises and deduplicates without broadening the session", () => {
    expect(requestedExerciseIds('["b","missing","b","a","unverified"]', new Set(["a", "b", "unrelated"])) ).toEqual(["b", "a"]);
  });
  it("rejects malformed and excessive requests", () => {
    for (const raw of ["invalid", "null", "{}", '["a",7]', JSON.stringify(Array(101).fill("a"))]) expect(requestedExerciseIds(raw, new Set(["a"]))).toEqual([]);
  });
  it("does not turn a content gap into a playable session", () => {
    expect(trainingBlockHref({ id: "gap", kind: "gap", area: "endgames", title: "No material", minutes: 10, mode: null, exerciseIds: [], reasons: [] })).toBeNull();
  });
});

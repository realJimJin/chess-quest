import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLevels, CATEGORY_TEXT, classifyPool, DAY_MS, LEVEL_SIZE, parseRatingValue, PASS_RATIO, recommendTraining, RECOMMENDER_VERSION,
  type ExerciseMeta, type TrainingAttempt, type TrainingInput, type TrainingProfile, type TrainingRecommendation,
} from "../recommend";
import { buildCampaign, LEVEL_SIZE as GAME_LEVEL_SIZE, PASS_RATIO as GAME_PASS_RATIO } from "../../game";
import { DAY } from "../../progress";
import type { Exercise, Finding } from "../../types";

// Everything below is invented for these tests: ids, chapters and numbers only, no positions from any book.
const NOW = 1_800_000_000_000;
const HOUR = 3600000;

const chapter = (book: string, stage: number, count: number, from = 1, over: Partial<ExerciseMeta> = {}): ExerciseMeta[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${book}-${stage}-${String(from + i).padStart(3, "0")}`, bookId: book, chapter: { id: `stage-${stage}`, title: `Invented stage ${stage}` },
    number: from + i, difficulty: stage, trainable: true, ...over,
  }));
const LIB = [...chapter("inv", 6, 24), ...chapter("inv", 7, 24, 25), ...chapter("inv", 8, 24, 49)];

const profile = (over: Partial<TrainingProfile> = {}): TrainingProfile => ({
  ratings: [], repertoire: [], goals: [], dailyGoal: 12,
  allocation: [{ key: "calculation", label: "Deep calculation", weight: 100 }], ...over,
});
const FULL_ALLOCATION: TrainingProfile["allocation"] = [
  { key: "games", label: "Serious games", weight: 30 }, { key: "calculation", label: "Deep calculation", weight: 25 },
  { key: "positional", label: "Positional play", weight: 20 }, { key: "endgames", label: "Endgames", weight: 15 }, { key: "repertoire", label: "Repertoire", weight: 10 },
];
const input = (over: Partial<TrainingInput> = {}): TrainingInput => ({ now: NOW, profile: profile(), exercises: LIB, attempts: [], srs: {}, ...over });

let tick = 0;
/** One attempt; each call is one hour later than the previous one inside a scenario built with `log`. */
const att = (exerciseId: string, result: TrainingAttempt["result"], over: Partial<TrainingAttempt> = {}): TrainingAttempt =>
  ({ exerciseId, ts: NOW - 1000 * HOUR + tick++ * HOUR, mode: "flow", result, timeMs: 120000, ...over });
/** First tries on `list`: the first `solved` are clean solves, the rest fail. */
const tries = (list: ExerciseMeta[], solved: number, over: Partial<TrainingAttempt> = {}) => list.map((e, i) => att(e.id, i < solved ? "solved" : "failed", over));
const finding = (category: Finding["category"], basis: Finding["basis"]): Finding => ({ category, basis, reason: "recorded in test" });

const block = (r: TrainingRecommendation, kind: string) => r.blocks.find((b) => b.kind === kind);
const reason = (r: TrainingRecommendation, code: string) => r.blocks.flatMap((b) => b.reasons).find((x) => x.code === code);
const allIds = (r: TrainingRecommendation) => r.blocks.flatMap((b) => b.exerciseIds);
const strings = (v: unknown): string[] => typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

// A spread of inputs that together reach every sentence the module can write; reused by the wording scans.
function scenarios(): Record<string, TrainingInput> {
  tick = 0;
  const d6 = LIB.filter((e) => e.difficulty === 6), d7 = LIB.filter((e) => e.difficulty === 7), d8 = LIB.filter((e) => e.difficulty === 8);
  const srsDue = Object.fromEntries(d6.slice(0, 9).map((e, i) => [e.id, { due: NOW - (9 - i) * DAY_MS, intervalDays: 1, lapses: i % 3 }]));
  const mixedFindings = [
    att(d6[0].id, "failed", { findings: [finding("missed_defence", "evidence"), finding("missed_defence", "self-reported")] }),
    att(d6[1].id, "assisted", { findings: [finding("missed_defence", "self-reported")] }),
    att(d6[2].id, "failed", { findings: [finding("time_management", "weak")] }),
    att(d6[3].id, "failed"), att(d6[4].id, "failed"),
  ];
  const ratings = [{ label: "USCF", value: "1860+" }, { label: "Online blitz", value: "~2100 blitz" }, { label: "Club ladder", value: "1700" }, { label: "FIDE", value: "unrated" }];
  return {
    emptyLibrary: input({ exercises: [], profile: profile({ allocation: FULL_ALLOCATION, repertoire: [{ side: "White", opening: "Invented Gambit" }], goals: ["Improve endgames", "Play more"] }) }),
    nothingValidated: input({ exercises: chapter("inv", 6, 5, 1, { trainable: false }) }),
    newUser: input(),
    newUserOtb: input({ profile: profile({ ratings }) }),
    newUserOnline: input({ profile: profile({ ratings: [{ label: "Online blitz", value: "~2100 blitz" }] }) }),
    reviews: input({ srs: { ...srsDue, "gone-1": { due: NOW - DAY_MS, intervalDays: 1, lapses: 0 } }, sessionMinutes: 90, profile: profile({ allocation: FULL_ALLOCATION }) }),
    easy: input({ attempts: tries(d6, 23) }),
    easyTopOfLibrary: input({ exercises: d6, attempts: tries(d6.slice(0, 10), 10) }),
    hold: input({ attempts: tries(d6.slice(0, 10), 7) }),
    slightlyHard: input({ attempts: tries(d6.slice(0, 10), 5) }),
    down: input({ attempts: tries(d7.slice(0, 6), 2) }),
    deepShift: input({ exercises: [...d7, ...d8], attempts: tries(d7.slice(0, 6), 1) }),
    upIntoHard: input({ attempts: [...tries(d6, 23), ...tries(d7.slice(0, 6), 1)] }),
    findings: input({ attempts: [...mixedFindings, att("gone-2", "solved")] }),
    observedTimes: input({ attempts: [...tries(d6.slice(0, 12), 9, { timeMs: 90000 }), ...tries(d6.slice(12, 18), 5, { mode: "deep", timeMs: 600000 })] }),
    allCleared: input({ exercises: d6.slice(0, 6), attempts: tries(d6.slice(0, 6), 6) }),
    tinyGoal: input({ profile: profile({ dailyGoal: 2 }), srs: srsDue, attempts: mixedFindings }),
    goalFilledByReview: input({ profile: profile({ dailyGoal: 1 }), srs: srsDue }),
    noAllocation: input({ profile: profile({ allocation: [] }) }),
    goalsAndRepertoire: input({
      exercises: [...LIB, ...chapter("rep", 3, 6, 1, { chapter: { id: "inv-gambit", title: "Invented Gambit lines" } }), ...chapter("mates", 2, 6, 1, { goal: "mate in two" })],
      bookAreas: { inv: "calculation", rep: "repertoire", mates: "calculation" },
      profile: profile({ allocation: FULL_ALLOCATION, repertoire: [{ side: "White", opening: "Invented Gambit" }, { side: "Black", opening: "Made-up Defence" }], goals: ["Sharper tactics", "Improve endgames", "Mate in two", "Win the club title"] }),
    }),
    goalWithoutBlock: input({ profile: profile({ goals: ["Sharper tactics"], allocation: [{ key: "games", label: "Games", weight: 100 }] }) }),
  };
}

describe("empty and new libraries", () => {
  it("empty library: only gap blocks, no exercises, and it says so", () => {
    const r = recommendTraining(scenarios().emptyLibrary);
    expect(r.version).toBe(RECOMMENDER_VERSION);
    expect(r.blocks.length).toBeGreaterThan(0);
    expect(r.blocks.every((b) => b.kind === "gap" && b.mode === null && b.exerciseIds.length === 0)).toBe(true);
    expect(r.blocks.map((b) => b.id)).toEqual(["gap:area:games", "gap:area:calculation", "gap:area:positional", "gap:area:endgames", "gap:area:repertoire", "gap:repertoire:white-invented-gambit", "gap:goal:improve-endgames", "gap:goal:play-more"]);
    expect(r.caveats.join(" ")).toMatch(/library is empty/);
    expect(r.skill.difficulty).toMatchObject({ targetBand: null, source: "none" });
    expect(r.summary).toMatch(/no exercises available/);
  });
  it("a library with nothing validated yields no exercises", () => {
    const r = recommendTraining(scenarios().nothingValidated);
    expect(allIds(r)).toEqual([]);
    expect(reason(r, "AREA_NO_MATERIAL")?.data).toMatchObject({ notValidated: 5 });
  });
  it("new user, no rating: starts in book order at the lowest difficulty, flagged provisional", () => {
    const r = recommendTraining(scenarios().newUser);
    expect(r.skill.difficulty).toMatchObject({ targetBand: 6, source: "book_order", direction: "hold", provisional: true });
    const b = block(r, "new_material")!;
    expect(b).toMatchObject({ id: "new:inv:stage-6:1", mode: "flow", bookId: "inv", chapterId: "stage-6", levelId: "inv:stage-6:1", minutes: 60 });
    expect(b.exerciseIds).toEqual(LIB.slice(0, 12).map((e) => e.id));
    expect(b.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(["BOOK_ORDER", "COMPLETED", "DIFFICULTY_BOOK_ORDER", "TIME_PER_EXERCISE", "ALLOCATION"]));
    expect(r.caveats).toContain("Fewer than 20 attempts recorded (0): difficulty targeting is provisional.");
    expect(block(r, "weakness_drill")).toBeUndefined();
    expect(block(r, "deep_calculation")).toBeUndefined();
  });
  it("new user with an OTB rating: weak prior for the starting band, reported with its numbers", () => {
    const r = recommendTraining(scenarios().newUserOtb);
    expect(r.skill.difficulty).toMatchObject({ targetBand: 7, source: "otb_prior", provisional: true });
    expect(reason(r, "DIFFICULTY_OTB_PRIOR")?.data).toMatchObject({ rating: 1860, pool: "otb", targetBand: 7, attempts: 0, libraryMin: 6, libraryMax: 8 });
    expect(r.skill.ratings.map((x) => [x.pool, x.value, x.usedAsPrior])).toEqual([["otb", 1860, true], ["online", 2100, false], ["unknown", 1700, false], ["otb", null, false]]);
    expect(reason(r, "DIFFICULTY_ONLINE_PRIOR")).toBeUndefined();
    expect(r.caveats.join(" ")).toMatch(/different pools/);
    expect(r.caveats.join(" ")).toMatch(/2 rating entries could not be read/);
    // the prior does not reorder the book: new material is still the first uncleared level
    expect(block(r, "new_material")!.levelId).toBe("inv:stage-6:1");
  });
  it("new user with only an online rating: an even weaker prior, labelled in a caveat", () => {
    const r = recommendTraining(scenarios().newUserOnline);
    expect(r.skill.difficulty).toMatchObject({ targetBand: 7, source: "online_prior" }); // middle of [6, 7, 8], per ONLINE_PRIOR
    expect(r.skill.ratings).toEqual([{ label: "Online blitz", raw: "~2100 blitz", pool: "online", value: 2100, usedAsPrior: true }]);
    expect(reason(r, "DIFFICULTY_ONLINE_PRIOR")?.data).toMatchObject({ rating: 2100, pool: "online" });
    expect(r.caveats.some((c) => /online rating/.test(c) && /very weak/.test(c))).toBe(true);
  });
  it("observed accuracy overrides any rating", () => {
    const s = scenarios();
    const r = recommendTraining({ ...s.hold, profile: profile({ ratings: [{ label: "FIDE", value: "2350" }, { label: "lichess rapid", value: "2500" }] }) });
    expect(r.skill.difficulty).toMatchObject({ targetBand: 6, source: "observed" });
    expect(r.skill.ratings.some((x) => x.usedAsPrior)).toBe(false);
  });
});

describe("due reviews", () => {
  it("come first, oldest first, capped, and report how many remain", () => {
    const r = recommendTraining(scenarios().reviews);
    const b = r.blocks[0];
    expect(b).toMatchObject({ id: "review:due", kind: "due_review", mode: "review", minutes: 18 });
    expect(b.exerciseIds).toEqual(LIB.slice(0, 6).map((e) => e.id));          // 9 due, capped at half of the daily goal of 12
    expect(b.reasons[0]).toMatchObject({ code: "REVIEW_DUE", data: { due: 9, included: 6, remaining: 3, oldestOverdueDays: 9 } });
    expect(b.reasons[0].text).toMatch(/9 reviews are due.*3 remain for a later session/);
    expect(reason(r, "REVIEW_LAPSES")?.data).toMatchObject({ lapsedTwicePlus: 2, maxLapses: 2 });
    expect(r.evidence).toMatchObject({ dueReviews: 9, dueReviewsSkipped: 1 });
    expect(r.caveats.join(" ")).toMatch(/1 due review points to exercises that are missing/);
  });
  it("nothing due yet means no review block", () => {
    const r = recommendTraining(input({ srs: { [LIB[0].id]: { due: NOW + 1, intervalDays: 3, lapses: 1 } } }));
    expect(block(r, "due_review")).toBeUndefined();
  });
});

describe("difficulty targeting from observed first-try accuracy", () => {
  const diff = (name: string) => recommendTraining(scenarios()[name]);
  it("above 90% over 20+ first tries moves up, and states the numbers", () => {
    const r = diff("easy");
    expect(r.skill.difficulty).toMatchObject({ targetBand: 7, source: "observed", direction: "up", provisional: false });
    const why = reason(r, "DIFFICULTY_OBSERVED")!;
    expect(why.data).toMatchObject({ band: 6, firstTries: 24, solvedFirstTry: 23, accuracy: 0.96, targetBand: 7 });
    expect(why.text).toMatch(/23 of 24 recent first tries solved at difficulty 6 \(96%\).*move up to difficulty 7/);
    expect(r.skill.difficulty.bands.find((b) => b.difficulty === 6)).toMatchObject({ firstTries: 24, solvedFirstTry: 23, counted: true });
  });
  it("high accuracy on a small sample, or at the top of the library, holds", () => {
    expect(diff("easyTopOfLibrary").skill.difficulty).toMatchObject({ targetBand: 6, direction: "hold" });
    expect(reason(diff("easyTopOfLibrary"), "DIFFICULTY_OBSERVED")!.text).toMatch(/nothing harder/);
    const small = recommendTraining(input({ attempts: tries(LIB.slice(0, 10), 10) }));
    expect(small.skill.difficulty).toMatchObject({ targetBand: 6, direction: "hold" });
    expect(reason(small, "DIFFICULTY_OBSERVED")!.text).toMatch(/moving up needs more than 90% over 20\+ first tries \(10 recorded\)/);
  });
  it("60–85% stays; 50–60% stays too", () => {
    expect(diff("hold").skill.difficulty).toMatchObject({ targetBand: 6, direction: "hold" });
    expect(reason(diff("hold"), "DIFFICULTY_OBSERVED")!.text).toMatch(/7 of 10.*\(70%\), inside the 60%–85% target range/);
    expect(diff("slightlyHard").skill.difficulty).toMatchObject({ targetBand: 6, direction: "hold" });
  });
  it("below 50% moves down when the library has something easier", () => {
    const r = diff("down");
    expect(r.skill.difficulty).toMatchObject({ targetBand: 6, direction: "down" });
    expect(reason(r, "DIFFICULTY_OBSERVED")!.text).toMatch(/2 of 6 recent first tries solved at difficulty 7 \(33%\), below 50%: move down to difficulty 6/);
  });
  it("below 50% with nothing easier shifts to deep calculation", () => {
    const r = diff("deepShift");
    expect(r.skill.difficulty).toMatchObject({ targetBand: 7, direction: "deep_shift" });
    const b = block(r, "deep_calculation")!;
    expect(b.mode).toBe("deep");
    expect(b.reasons.map((x) => x.code)).toEqual(expect.arrayContaining(["ACCURACY_BELOW_FLOOR", "DIFFICULTY_OBSERVED"]));
    expect(diff("upIntoHard").skill.difficulty).toMatchObject({ targetBand: 7, direction: "deep_shift" });
  });
});

describe("error categories", () => {
  const d6 = LIB.slice(0, 24);
  it("drills from recorded evidence and counts each basis", () => {
    const r = recommendTraining(scenarios().findings);
    const b = block(r, "weakness_drill")!;
    expect(b).toMatchObject({ id: "drill:missed_defence", mode: "deep" });
    expect(b.exerciseIds).toEqual([d6[1].id]); // 15 min fits one 8 min deep exercise
    const longer = recommendTraining({ ...scenarios().findings, sessionMinutes: 120 });
    expect(block(longer, "weakness_drill")!.exerciseIds).toEqual([d6[1].id, d6[0].id]); // enough time for both, most recent first
    expect(b.reasons[0]).toMatchObject({ code: "WEAKNESS_FINDINGS", data: { category: "missed_defence", evidence: 1, selfReported: 1, weak: 0, recentMisses: 5, score: 5 } });
    expect(b.reasons[0].text).toMatch(/^2 of your last 5 misses were tagged missed defence: 1 from recorded evidence, 1 self-reported, 0 from weak signals\./);
    expect(r.evidence.categories.time_management).toEqual({ evidence: 0, selfReported: 0, weak: 1 });
  });
  it("evidence outweighs self-report, which outweighs weak signals", () => {
    tick = 0;
    const r = recommendTraining(input({ attempts: [
      att(d6[0].id, "failed", { findings: [finding("evaluation", "evidence")] }),
      att(d6[1].id, "failed", { findings: [finding("calculation", "self-reported")] }),
      att(d6[2].id, "failed", { findings: [finding("visualization", "weak")] }), att(d6[3].id, "failed", { findings: [finding("visualization", "weak")] }),
    ] }));
    expect(block(r, "weakness_drill")!.id).toBe("drill:evaluation");
  });
  it("a single self-report or weak signal is not enough; two self-reports are", () => {
    tick = 0;
    const one = recommendTraining(input({ attempts: [att(d6[0].id, "failed", { findings: [finding("calculation", "self-reported")] }), att(d6[1].id, "failed", { findings: [finding("visualization", "weak")] })] }));
    expect(block(one, "weakness_drill")).toBeUndefined();
    const two = recommendTraining(input({ attempts: [att(d6[0].id, "failed", { findings: [finding("calculation", "self-reported")] }), att(d6[1].id, "assisted", { findings: [finding("calculation", "self-reported")] })] }));
    expect(block(two, "weakness_drill")!.reasons[0].data).toMatchObject({ category: "calculation", evidence: 0, selfReported: 2, weak: 0 });
  });
  it("misses with no findings are reported as unexplained and never attributed", () => {
    tick = 0;
    const r = recommendTraining(input({ attempts: tries(d6.slice(0, 8), 2) }));
    expect(block(r, "weakness_drill")).toBeUndefined();
    expect(r.evidence).toMatchObject({ recentMisses: 6, unexplainedMisses: 6 });
    expect(Object.values(r.evidence.categories).every((c) => c.evidence + c.selfReported + c.weak === 0)).toBe(true);
    expect(r.caveats).toContain("6 of your last 6 misses have no recorded findings; they are counted as unexplained and not assigned to any category.");
    const mixed = recommendTraining(scenarios().findings);
    expect(mixed.evidence.unexplainedMisses).toBe(2);
    expect(block(mixed, "weakness_drill")!.reasons.some((x) => x.code === "UNEXPLAINED_MISSES")).toBe(true);
  });
});

describe("time spent", () => {
  it("recommends deep work when its share of training time is low and attempts >= 10", () => {
    tick = 0;
    const r = recommendTraining(input({ attempts: tries(LIB.slice(0, 10), 7) }));
    const why = reason(r, "LOW_DEEP_SHARE")!;
    expect(why.data).toMatchObject({ deepShare: 0, deepMinutes: 0, totalMinutes: 20, attempts: 10, threshold: 0.2 });
    expect(block(r, "deep_calculation")).toMatchObject({ mode: "deep", minutes: 18 });
    const nine = recommendTraining(input({ attempts: tries(LIB.slice(0, 9), 7) }));
    expect(block(nine, "deep_calculation")).toBeUndefined();
  });
  it("sizes blocks from the recorded time per exercise", () => {
    const r = recommendTraining(scenarios().observedTimes);
    expect(r.evidence).toMatchObject({ medianFlowMinutes: 1.5, medianDeepMinutes: 10 });
    expect(r.evidence.deepShare).toBeCloseTo(0.769, 2);
    expect(block(r, "deep_calculation")).toBeUndefined();                    // deep share is not low
    expect(block(r, "new_material")!.mode).toBe("deep"); // first level cleared; next is the chapter's boss
    expect(reason(r, "TIME_PER_EXERCISE")!.text).toMatch(/10 min per exercise from your median of 10 min over 6 deep attempts/);
    const flow = recommendTraining(input({ attempts: tries(LIB.slice(0, 12), 7, { timeMs: 90000 }) }));
    expect(block(flow, "new_material")!.mode).toBe("flow");
    expect(block(flow, "new_material")!.reasons.find(r => r.code === "TIME_PER_EXERCISE")!.text).toMatch(/1\.5 min per exercise from your median of 1\.5 min over 12 non-deep attempts/);
  });
});

describe("gaps, minutes and bounds", () => {
  it("emits gap blocks for areas, repertoire entries and goals the library cannot serve", () => {
    const r = recommendTraining(scenarios().goalsAndRepertoire);
    const ids = r.blocks.filter((b) => b.kind === "gap").map((b) => b.id);
    expect(ids).toEqual(["gap:area:games", "gap:area:positional", "gap:area:endgames", "gap:repertoire:black-made-up-defence", "gap:goal:improve-endgames", "gap:goal:win-the-club-title"]);
    expect(r.blocks.find((b) => b.id === "gap:area:endgames")!.reasons[0].code).toBe("AREA_NO_MATERIAL");
    expect(r.blocks.find((b) => b.id === "gap:area:games")!.reasons[0].code).toBe("AREA_OUTSIDE_APP");
    const rep = r.blocks.find((b) => b.area === "repertoire" && b.kind === "new_material")!;
    expect(rep.bookId).toBe("rep");
    expect(rep.reasons.find((x) => x.code === "REPERTOIRE_COVERED")!.data).toMatchObject({ opening: "Invented Gambit", matchingExercises: 6 });
    expect(r.blocks.flatMap((b) => b.reasons).filter((x) => x.code === "GOAL_SUPPORTED").map((x) => x.data.goal)).toEqual(["Sharper tactics", "Mate in two"]);
    expect(r.evidence.goals.map((g) => [g.goal, g.area, g.served])).toEqual([["Sharper tactics", "calculation", true], ["Improve endgames", "endgames", false], ["Mate in two", "calculation", true], ["Win the club title", null, false]]);
    expect(r.evidence.repertoire).toEqual([{ side: "White", opening: "Invented Gambit", matchingExercises: 6 }, { side: "Black", opening: "Made-up Defence", matchingExercises: 0 }]);
    expect(r.blocks.filter((b) => b.kind === "gap").every((b) => b.exerciseIds.length === 0)).toBe(true);
  });
  it("a goal with material but no block in this session is a caveat", () => {
    const r = recommendTraining(scenarios().goalWithoutBlock);
    expect(r.caveats.join(" ")).toMatch(/72 validated exercises for your goal "Sharper tactics", but this session gives that area no block/);
  });
  it("splits the minutes by allocation weight and always sums to sessionMinutes", () => {
    const r = recommendTraining(input({ profile: profile({ allocation: FULL_ALLOCATION }) }));
    const byArea = (x: TrainingRecommendation) => Object.fromEntries(FULL_ALLOCATION.map((a) => [a.key, x.blocks.filter((b) => b.area === a.key).reduce((s, b) => s + b.minutes, 0)]));
    expect(byArea(r)).toEqual({ games: 18, calculation: 15, positional: 12, endgames: 9, repertoire: 6 });
    expect(block(r, "new_material")!.exerciseIds).toHaveLength(5);            // 15 min at the default 3 min each
    const longer = recommendTraining(input({ sessionMinutes: 120, profile: profile({ allocation: FULL_ALLOCATION }) }));
    expect(byArea(longer)).toEqual({ games: 36, calculation: 30, positional: 24, endgames: 18, repertoire: 12 });
    const withReviews = recommendTraining(scenarios().reviews);              // 90 min, 18 of them on reviews
    expect(byArea(withReviews)).toEqual({ games: 22, calculation: 18, positional: 14, endgames: 11, repertoire: 7 });
    const filled = recommendTraining(scenarios().goalFilledByReview);
    expect(allIds(filled)).toEqual([LIB[0].id]);
    expect(reason(filled, "DAILY_GOAL_REACHED")?.data).toMatchObject({ dailyGoal: 1 });
    for (const [name, s] of Object.entries(scenarios())) {
      const out = recommendTraining(s);
      expect(out.blocks.reduce((sum, b) => sum + b.minutes, 0), name).toBe(out.evidence.sessionMinutes);
    }
    expect(recommendTraining(input({ sessionMinutes: -5 })).evidence.sessionMinutes).toBe(60);
    expect(recommendTraining(scenarios().noAllocation).caveats.join(" ")).toMatch(/No allocation weights are set/);
  });
  it("dailyGoal bounds the number of exercises across the plan", () => {
    const tiny = recommendTraining(scenarios().tinyGoal);
    expect(allIds(tiny)).toHaveLength(2);
    expect(tiny.blocks[0]).toMatchObject({ kind: "due_review", exerciseIds: [LIB[0].id] });
    expect(tiny.blocks.flatMap((b) => b.reasons).some((x) => x.code === "DAILY_GOAL")).toBe(true);
    const filled = recommendTraining(scenarios().goalFilledByReview);
    expect(allIds(filled)).toEqual([LIB[0].id]);
    expect(reason(filled, "DAILY_GOAL_REACHED")?.data).toMatchObject({ dailyGoal: 1 });
    for (const [name, s] of Object.entries(scenarios())) {
      const out = recommendTraining(s);
      expect(allIds(out).length, name).toBeLessThanOrEqual(out.evidence.dailyGoal);
      expect(new Set(allIds(out)).size, name).toBe(allIds(out).length);        // no exercise twice
      expect(out.evidence.exercisesPlanned, name).toBe(allIds(out).length);
    }
  });
  it("when everything is cleared it says so instead of inventing material", () => {
    const r = recommendTraining(scenarios().allCleared);
    expect(allIds(r)).toEqual([]);
    expect(reason(r, "NO_NEW_MATERIAL")?.data).toMatchObject({ completed: 6, trainableExercises: 6 });
  });
});

describe("library safety", () => {
  it("never recommends a non-trainable or unknown exercise", () => {
    const mixed = LIB.map((e, i) => (i % 3 === 0 ? { ...e, trainable: false } : e));
    const bad = new Set(mixed.filter((e) => !e.trainable).map((e) => e.id));
    tick = 0;
    const r = recommendTraining(input({
      exercises: mixed,
      srs: Object.fromEntries([...mixed.slice(0, 6).map((e) => e.id), "ghost"].map((id, i) => [id, { due: NOW - (i + 1) * HOUR, intervalDays: 1, lapses: 1 }])),
      attempts: [...mixed.slice(0, 12).map((e) => att(e.id, "failed", { findings: [finding("calculation", "evidence")] })), att("ghost", "failed", { findings: [finding("calculation", "evidence")] })],
    }));
    const known = new Set(mixed.map((e) => e.id));
    expect(allIds(r).length).toBeGreaterThan(0);
    expect(allIds(r).filter((id) => bad.has(id) || !known.has(id))).toEqual([]);
    expect(r.evidence.dueReviewsSkipped).toBe(3);
    expect(block(r, "new_material")!.exerciseIds.every((id) => !bad.has(id))).toBe(true);
    const filled = recommendTraining(scenarios().goalFilledByReview);
    expect(allIds(filled)).toEqual([LIB[0].id]);
    expect(reason(filled, "DAILY_GOAL_REACHED")?.data).toMatchObject({ dailyGoal: 1 });
    for (const [name, s] of Object.entries(scenarios())) {
      const ok = new Set(s.exercises.filter((e) => e.trainable).map((e) => e.id));
      expect(allIds(recommendTraining(s)).filter((id) => !ok.has(id)), name).toEqual([]);
    }
  });
  it("new material follows book order and the campaign's levels", () => {
    tick = 0;
    const r = recommendTraining(input({ attempts: tries(LIB.slice(0, 9), 9, { mode: "deep" }) }));   // 9 of 12 clears level 1
    const b = block(r, "new_material")!;
    expect(b).toMatchObject({ levelId: "inv:stage-6:2", mode: "deep", title: "Boss level · № 13–24" });
    expect(b.exerciseIds).toEqual(LIB.slice(12, 12 + b.exerciseIds.length).map((e) => e.id));
    expect(b.reasons.find((x) => x.code === "COMPLETED")!.data).toMatchObject({ completed: 9, trainable: 72, levelsCleared: 1 });
    expect(b.reasons.some((x) => x.code === "BOSS_LEVEL")).toBe(true);
  });
  it("levels match game.ts buildCampaign for the same data", () => {
    expect([LEVEL_SIZE, PASS_RATIO, DAY_MS]).toEqual([GAME_LEVEL_SIZE, GAME_PASS_RATIO, DAY]);
    const meta = [...chapter("par", 1, 29), ...chapter("par", 2, 7, 30), ...chapter("par", 3, 4, 37, { trainable: false })];
    const full: Exercise[] = meta.map((m) => ({
      id: m.id, bookId: m.bookId, chapter: m.chapter, number: m.number, pdfPage: 0, fen: "invented", sideToMove: "white", instruction: "", solutionRaw: "",
      solution: m.trainable ? [{ san: "x", uci: "a1a2", children: [] }] : [], explanation: null, difficulty: { value: m.difficulty, source: "estimate" },
      verification: { status: m.trainable ? "verified" : "needs_review", fenConfidence: 1, fenLegal: true, solutionLegal: true, engine: null, flags: [] },
    }));
    const done = new Set(meta.slice(0, 10).map((m) => m.id));
    const camp = buildCampaign("par", full, done);
    const mine = buildLevels("par", meta, done);
    expect(mine.map((l) => [l.id, l.ids, l.boss, l.cleared, l.first, l.last])).toEqual(camp.levels.map((l) => [l.id, l.exerciseIds, l.boss, l.state === "cleared", l.firstNumber, l.lastNumber]));
    expect(mine.map((l) => l.ids.length)).toEqual([12, 17, 7]);
  });
});

describe("determinism and purity", () => {
  it("same input twice gives deep-equal, JSON-serialisable output and leaves the input untouched", () => {
    const filled = recommendTraining(scenarios().goalFilledByReview);
    expect(allIds(filled)).toEqual([LIB[0].id]);
    expect(reason(filled, "DAILY_GOAL_REACHED")?.data).toMatchObject({ dailyGoal: 1 });
    for (const [name, s] of Object.entries(scenarios())) {
      const before = JSON.stringify(s);
      const a = recommendTraining(s), b = recommendTraining(s);
      expect(a, name).toEqual(b);
      expect(JSON.stringify(a), name).toBe(JSON.stringify(b));
      expect(JSON.parse(JSON.stringify(a)), name).toEqual(a);
      expect(JSON.stringify(s), name).toBe(before);
      expect(new Set(a.blocks.map((x) => x.id)).size, name).toBe(a.blocks.length);
    }
  });
  it("does not depend on the order rows arrive in", () => {
    const s = scenarios().findings;
    const shuffled = { ...s, attempts: [...s.attempts].reverse(), exercises: [...s.exercises].reverse(), srs: Object.fromEntries(Object.entries(s.srs).reverse()) };
    expect(recommendTraining(shuffled)).toEqual(recommendTraining(s));
  });
  it("the module has no runtime imports, clock or randomness", () => {
    const src = readFileSync(new URL("../recommend.ts", import.meta.url), "utf8");
    expect(src.match(/^import (?!type )/gm)).toBeNull();
    expect(src).not.toMatch(/Date\.now|new Date|Math\.random|process\.|localStorage|window\.|document\.|require\(/);
  });
});

describe("wording", () => {
  // No sentence may state or imply a cognitive, emotional or psychological cause.
  const BANNED = /impatien|careless|anxi|nervous|panic|lazy|laziness|rush|hast[yi]|impulsiv|overconfiden|confiden|tilt|frustrat|afraid|fear|bored|tired|fatigue|sloppy|inattent|attention|distract|concentrat|lack of focus|los(e|t|ing) focus|unfocus|disciplin|psycholog|emotion|cognitiv|mental|mindset|stress|motivat|nerves|in your head|blind spot|tunnel vision/i;
  // Nor may any sentence relate an online rating to an over-the-board one.
  const EQUIVALENCE = /equivalent|convert|≈|same as|correspond|translates? to|about \d{3,4} (otb|over|uscf|fide)|worth \d{3,4}/i;
  const produced = () => Object.entries(scenarios()).flatMap(([name, s]) => strings(recommendTraining(s)).map((text) => ({ name, text })));

  it("the scenarios reach every reason code the module defines", () => {
    const src = readFileSync(new URL("../recommend.ts", import.meta.url), "utf8");
    const defined = [...new Set(src.slice(src.indexOf("export type ReasonCode"), src.indexOf("export type ReasonData")).match(/"[A-Z_]+"/g)!.map((c) => c.slice(1, -1)))];
    const seen = new Set(Object.values(scenarios()).flatMap((s) => recommendTraining(s).blocks.flatMap((b) => b.reasons.map((x) => x.code as string))));
    expect(defined.length).toBeGreaterThan(20);
    expect(defined.filter((c) => !seen.has(c))).toEqual([]);
  });
  it("no produced string, static text or line of the source uses a banned word", () => {
    for (const { name, text } of produced()) expect(BANNED.test(text), `${name}: ${text}`).toBe(false);
    for (const text of strings(CATEGORY_TEXT)) expect(BANNED.test(text), text).toBe(false);
    const src = readFileSync(new URL("../recommend.ts", import.meta.url), "utf8");
    for (const line of src.split("\n")) expect(BANNED.test(line), line).toBe(false);
  });
  it("the scan itself catches the phrases it is meant to", () => {
    for (const bad of ["you were impatient", "a careless move", "anxious play", "lack of focus", "you panic", "rushing"]) expect(BANNED.test(bad), bad).toBe(true);
    for (const bad of ["2100 blitz is equivalent to 1900 FIDE", "converted to USCF"]) expect(EQUIVALENCE.test(bad), bad).toBe(true);
  });
  it("never equates online and over-the-board ratings", () => {
    for (const { name, text } of produced()) expect(EQUIVALENCE.test(text), `${name}: ${text}`).toBe(false);
    const r = recommendTraining(scenarios().newUserOtb);
    const nums = strings({ b: r.blocks, c: r.caveats, s: r.summary }).join(" ");
    expect(nums).toMatch(/1860/);
    expect(nums).not.toMatch(/2100/);                                         // the online number is listed in `skill` only
    expect(r.skill.ratings.filter((x) => x.usedAsPrior).map((x) => x.pool)).toEqual(["otb"]);
  });
});

describe("ratings", () => {
  it("classifies the pool from the label", () => {
    const pool = (label: string, value = "") => classifyPool(label, value);
    for (const l of ["OTB", "Over-the-board rating", "over the board", "USCF", "FIDE classical", "National federation rating", "ECF"]) expect(pool(l), l).toBe("otb");
    for (const l of ["Online blitz", "Online rapid", "bullet", "Lichess", "chess.com rapid", "Chess.com", "blitz"]) expect(pool(l), l).toBe("online");
    for (const l of ["", "Rating", "Club ladder", "FIDE online blitz", "USCF / lichess"]) expect(pool(l), l).toBe("unknown");
    expect(pool("", "~2100 blitz")).toBe("online");
    expect(pool("Rating", "1900 USCF")).toBe("otb");
  });
  it("parses messy values defensively", () => {
    const cases: [string, number | null][] = [["1860+", 1860], ["~2100 blitz", 2100], ["", null], ["unrated", null], ["  1500 ", 1500], ["1500-1600", 1500], ["2000?", 2000], ["12", null], ["99999", null], ["9000", null], ["n/a", null], ["0", null]];
    for (const [raw, want] of cases) expect(parseRatingValue(raw), JSON.stringify(raw)).toBe(want);
    expect(parseRatingValue(undefined as unknown as string)).toBeNull();
  });
  it("keeps every rating in its own pool in the skill section", () => {
    const r = recommendTraining(input({ profile: profile({ ratings: [{ label: "Over-the-board rating", value: "" }, { label: "Online blitz", value: "unrated" }, { label: "Online rapid", value: "1650" }] }) }));
    expect(r.skill.ratings).toEqual([
      { label: "Over-the-board rating", raw: "", pool: "otb", value: null, usedAsPrior: false },
      { label: "Online blitz", raw: "unrated", pool: "online", value: null, usedAsPrior: false },
      { label: "Online rapid", raw: "1650", pool: "online", value: 1650, usedAsPrior: true },
    ]);
    expect(r.skill.difficulty.source).toBe("online_prior");
  });
});

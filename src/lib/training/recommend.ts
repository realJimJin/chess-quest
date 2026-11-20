// Personalised training recommender: the pure decision core.
// Type-only imports, no clock, no storage, no randomness: the same input always
// gives the same JSON-serialisable output. Every sentence it writes describes
// what was recorded; it never names a reason why a miss happened.
import type { Attempt, Category, Mode, Srs } from "../types";
import type { AreaKey, PlayerProfile } from "../profile";

export const RECOMMENDER_VERSION = "training-recommender/1";

// ---------------------------------------------------------------- thresholds
/** Mirrors of game.ts (LEVEL_SIZE, PASS_RATIO) and progress.ts (DAY); a test pins them together. */
export const LEVEL_SIZE = 12;
export const PASS_RATIO = 0.7;
export const DAY_MS = 86400000;

export const T = {
  defaultSessionMinutes: 60, maxSessionMinutes: 600, defaultDailyGoal: 12,
  provisionalAttempts: 20,      // below this, difficulty targeting is provisional and rating priors may apply
  recentFirstTries: 60,         // window of most recent first attempts used for band accuracy
  minBandSample: 5,             // first tries needed before a band's accuracy counts
  targetLow: 0.6, targetHigh: 0.85,
  tooEasy: 0.9, tooEasySample: 20,
  tooHard: 0.5,
  recentMisses: 30,             // window of most recent non-clean attempts used for error categories
  basisWeight: { evidence: 3, "self-reported": 2, weak: 1 },
  drillMinScore: 3,             // one evidence miss, or two self-reported, or three weak
  deepShareLow: 0.2, deepShareMinAttempts: 10,
  reviewCap: 10, reviewMinutesEach: 3, reviewMaxMinutes: 20, reviewMaxSessionShare: 1 / 3,
  drillShare: 0.25, deepShare: 0.3, minMinutesToSplit: 10,
  flowMinutes: { fallback: 3, min: 1, max: 6 }, deepMinutes: { fallback: 8, min: 3, max: 15 }, minTimeSample: 5,
} as const;

/** Weak prior for the STARTING band only, used when fewer than 20 attempts exist and no band
 *  has an observed sample. An over-the-board rating picks a position (0 = easiest, 1 = hardest)
 *  among the distinct difficulty values of the trainable library. A heuristic, not a rating model. */
export const OTB_PRIOR: { below: number; position: number }[] = [
  { below: 1200, position: 0 }, { below: 1600, position: 0.25 }, { below: 1900, position: 0.5 },
  { below: 2200, position: 0.75 }, { below: Infinity, position: 1 },
];
/** A separate, deliberately flatter table for online pools, consulted only when no
 *  over-the-board rating is usable. It is its own scale: it never reaches past the middle of
 *  the library and is never derived from, or compared with, the table above. */
export const ONLINE_PRIOR: { below: number; position: number }[] = [
  { below: 1500, position: 0 }, { below: 2000, position: 0.25 }, { below: Infinity, position: 0.5 },
];

export const CATEGORIES: Category[] = ["missed_candidate", "visualization", "missed_defence", "evaluation", "calculation", "time_management"];
/** Neutral tag names and procedural drills (what to do, never why the miss happened). */
export const CATEGORY_TEXT: Record<Category, { label: string; drill: string }> = {
  missed_candidate: { label: "missed candidate move", drill: "Fill the candidates box with every check, capture and threat before writing any line." },
  visualization: { label: "visualization", drill: "Write each line to its end without moving the pieces, then list where the pieces stand." },
  missed_defence: { label: "missed defence", drill: "For each move in your line, write the two strongest replies before continuing." },
  evaluation: { label: "evaluation", drill: "End every written line with a verdict and the reason for it, then compare with the solution." },
  calculation: { label: "calculation", drill: "Write the main line in full and check it move by move before committing." },
  time_management: { label: "time management", drill: "Set a planned thinking time and commit only when the line is written to the end or the time is used." },
};

// --------------------------------------------------------------------- types
export interface ExerciseMeta {
  id: string; bookId: string; chapter: { id: string; title: string }; number: number;
  /** Exercise.difficulty.value */
  difficulty: number;
  /** isTrainable(exercise), decided by the caller */
  trainable: boolean;
  goal?: string | null;
}
export type TrainingProfile = Pick<PlayerProfile, "ratings" | "repertoire" | "goals" | "allocation" | "dailyGoal">;
export type TrainingAttempt = Pick<Attempt, "exerciseId" | "ts" | "mode" | "result" | "timeMs" | "finished" | "findings">;

export interface TrainingInput {
  now: number;
  profile: TrainingProfile;
  exercises: ExerciseMeta[];
  attempts: TrainingAttempt[];
  srs: Record<string, Srs>;
  /** default 60 */
  sessionMinutes?: number;
  /** bookId -> area. Books without an entry are treated as "calculation" (reported in a caveat). */
  bookAreas?: Record<string, AreaKey>;
}

export type RatingPool = "otb" | "online" | "unknown";
export interface ParsedRating { label: string; raw: string; pool: RatingPool; value: number | null; usedAsPrior: boolean }

export type BlockKind = "due_review" | "new_material" | "deep_calculation" | "weakness_drill" | "gap";
export type ReasonCode =
  | "REVIEW_DUE" | "REVIEW_LAPSES"
  | "BOOK_ORDER" | "COMPLETED" | "TIME_PER_EXERCISE" | "DAILY_GOAL" | "ALLOCATION"
  | "DIFFICULTY_OBSERVED" | "DIFFICULTY_OTB_PRIOR" | "DIFFICULTY_ONLINE_PRIOR" | "DIFFICULTY_BOOK_ORDER"
  | "LOW_DEEP_SHARE" | "ACCURACY_BELOW_FLOOR" | "BOSS_LEVEL"
  | "WEAKNESS_FINDINGS" | "UNEXPLAINED_MISSES"
  | "AREA_NO_MATERIAL" | "AREA_OUTSIDE_APP" | "NO_NEW_MATERIAL" | "DAILY_GOAL_REACHED"
  | "REPERTOIRE_NO_MATERIAL" | "REPERTOIRE_COVERED" | "GOAL_NO_MATERIAL" | "GOAL_SUPPORTED";
export type ReasonData = Record<string, number | string | boolean | null>;
export interface Reason { code: ReasonCode; text: string; data: ReasonData }

export interface TrainingBlock {
  /** stable for the same library state, e.g. "review:due", "new:cs2a:stage-6:2", "drill:missed_defence", "gap:area:endgames" */
  id: string;
  kind: BlockKind;
  area: AreaKey | "review";
  title: string;
  minutes: number;
  /** null only for gap blocks, which have nothing to open */
  mode: Mode | null;
  /** capped, in the order to do them; always trainable ids from the input library */
  exerciseIds: string[];
  /** set when every exercise in the block shares them */
  bookId?: string; chapterId?: string; levelId?: string;
  reasons: Reason[];
}

export interface BandStat { difficulty: number; firstTries: number; solvedFirstTry: number; accuracy: number | null; counted: boolean }
export type DifficultySource = "observed" | "otb_prior" | "online_prior" | "book_order" | "none";
export type DifficultyDirection = "up" | "down" | "hold" | "deep_shift";
export interface SkillSection {
  /** every rating as entered, each in its own pool; never merged */
  ratings: ParsedRating[];
  firstTryAccuracy: number | null;
  difficulty: { targetBand: number | null; source: DifficultySource; direction: DifficultyDirection; provisional: boolean; bands: BandStat[] };
}
export type BasisCounts = { evidence: number; selfReported: number; weak: number };
export interface EvidenceSection {
  totalAttempts: number; attemptedExercises: number; completedExercises: number;
  libraryExercises: number; trainableExercises: number;
  firstTryAccuracy: number | null;
  totalTimeMs: number; deepTimeMs: number; deepShare: number | null;
  medianFlowMinutes: number | null; medianDeepMinutes: number | null;
  dueReviews: number; dueReviewsSkipped: number; maxLapses: number;
  recentMisses: number; unexplainedMisses: number;
  categories: Record<Category, BasisCounts>;
  sessionMinutes: number; dailyGoal: number; exercisesPlanned: number;
  repertoire: { side: string; opening: string; matchingExercises: number }[];
  goals: { goal: string; area: AreaKey | null; matchingExercises: number; served: boolean }[];
}
export interface TrainingRecommendation {
  version: string; summary: string; skill: SkillSection; blocks: TrainingBlock[]; evidence: EvidenceSection; caveats: string[];
}

// ------------------------------------------------------------------- helpers
const pct = (x: number) => `${Math.round(x * 100)}%`;
const n = (count: number, word: string, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s: string) => norm(s).replace(/ /g, "-").slice(0, 40) || "entry";
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const OTB_RE = /\b(otb|over[\s-]?the[\s-]?board|uscf|fide|ecf|dwz|cfc|acf|national|federation|classical)\b/;
const ONLINE_RE = /\b(online|blitz|rapid|bullet|lichess|chess\.?com|chesscom|puzzle|internet)\b/;
/** Pool from the label (and any words typed into the value). Both or neither kind of marker gives "unknown". */
export function classifyPool(label: string, value = ""): RatingPool {
  const t = `${label ?? ""} ${value ?? ""}`.toLowerCase();
  const otb = OTB_RE.test(t), online = ONLINE_RE.test(t);
  return otb === online ? "unknown" : otb ? "otb" : "online";
}
/** First standalone 3–4 digit number between 100 and 3500 ("1860+", "~2100 blitz"); otherwise null. */
export function parseRatingValue(value: string): number | null {
  const m = /(?<!\d)\d{3,4}(?!\d)/.exec(String(value ?? ""));
  const v = m ? Number(m[0]) : NaN;
  return v >= 100 && v <= 3500 ? v : null;
}

export interface LevelMeta { id: string; bookId: string; chapterId: string; title: string; index: number; ids: string[]; first: number; last: number; boss: boolean; cleared: boolean; difficulty: number }
/** The light-shape twin of game.ts buildCampaign: chapters in book order, levels of 12, a short tail merged. */
export function buildLevels(bookId: string, exercises: ExerciseMeta[], done: Set<string>): LevelMeta[] {
  const pool = exercises.filter((e) => e.bookId === bookId && e.trainable).sort((a, b) => a.number - b.number);
  const byChapter = new Map<string, ExerciseMeta[]>();
  for (const e of pool) byChapter.set(e.chapter.id, [...(byChapter.get(e.chapter.id) ?? []), e]);
  const levels: LevelMeta[] = [];
  for (const [chapterId, list] of byChapter) {
    const chunks: ExerciseMeta[][] = [];
    for (let i = 0; i < list.length; i += LEVEL_SIZE) chunks.push(list.slice(i, i + LEVEL_SIZE));
    if (chunks.length > 1 && chunks[chunks.length - 1].length < LEVEL_SIZE / 2) chunks[chunks.length - 2].push(...chunks.pop()!);
    chunks.forEach((chunk, k) => levels.push({
      id: `${bookId}:${chapterId}:${k + 1}`, bookId, chapterId, title: list[0].chapter.title, index: levels.length,
      ids: chunk.map((e) => e.id), first: chunk[0].number, last: chunk[chunk.length - 1].number, boss: k === chunks.length - 1,
      cleared: chunk.filter((e) => done.has(e.id)).length >= Math.ceil(chunk.length * PASS_RATIO),
      difficulty: median(chunk.map((e) => e.difficulty)) ?? 0,
    }));
  }
  return levels;
}

/** Split `total` whole minutes by weight; largest remainders first, so the parts sum to `total`. */
function splitMinutes(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum), out = exact.map(Math.floor);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0, left = total - out.reduce((s, v) => s + v, 0); k < left; k++) out[order[k % order.length].i]++;
  return out;
}

const GOAL_AREAS: { area: AreaKey; re: RegExp }[] = [
  { area: "endgames", re: /endgame|ending/ }, { area: "repertoire", re: /opening|repertoire/ },
  { area: "positional", re: /positional|strateg/ }, { area: "calculation", re: /calculat|tactic|combination|puzzle|checkmate/ },
];

// ---------------------------------------------------------------------- core
export function recommendTraining(input: TrainingInput): TrainingRecommendation {
  const now = num(input.now);
  const profile = input.profile ?? ({} as TrainingProfile);
  const caveats: string[] = [];
  const rawSession = num(input.sessionMinutes, T.defaultSessionMinutes);
  const sessionMinutes = rawSession > 0 ? Math.min(T.maxSessionMinutes, Math.max(1, Math.round(rawSession))) : T.defaultSessionMinutes;
  const dailyGoal = Math.max(1, Math.round(num(profile.dailyGoal, T.defaultDailyGoal)) || T.defaultDailyGoal);

  // ---- library
  const byId = new Map<string, ExerciseMeta>();
  for (const e of input.exercises ?? []) if (e && typeof e.id === "string" && !byId.has(e.id)) byId.set(e.id, { ...e, difficulty: num(e.difficulty), number: num(e.number) });
  const library = [...byId.values()].sort((a, b) => a.bookId.localeCompare(b.bookId) || a.number - b.number || a.id.localeCompare(b.id));
  const trainable = library.filter((e) => e.trainable);
  const areaOf = (bookId: string): AreaKey => input.bookAreas?.[bookId] ?? "calculation";
  const unmapped = [...new Set(trainable.map((e) => e.bookId))].filter((b) => !input.bookAreas?.[b]);
  if (!library.length) caveats.push("The library is empty: import a book to get exercises. Nothing is invented to fill the plan.");
  else if (!trainable.length) caveats.push(`None of the ${n(library.length, "exercise")} in the library is validated for training yet.`);
  if (unmapped.length) caveats.push(`${n(unmapped.length, "book")} without an area mapping ${unmapped.length === 1 ? "is" : "are"} treated as calculation material.`);

  // ---- attempt log
  const attempts = (input.attempts ?? []).map((a, i) => ({ a: { ...a, ts: num(a.ts), timeMs: Math.max(0, num(a.timeMs)) }, i }))
    .sort((x, y) => x.a.ts - y.a.ts || x.i - y.i).map((x) => x.a);
  const byEx = new Map<string, TrainingAttempt[]>();
  for (const a of attempts) byEx.set(a.exerciseId, [...(byEx.get(a.exerciseId) ?? []), a]);
  const done = new Set<string>();
  let firstOk = 0;
  for (const [id, list] of byEx) {
    if (list.some((a) => a.result !== "failed" || a.finished)) done.add(id);
    if (list[0].result === "solved") firstOk++;
  }
  const firstTryAccuracy = byEx.size ? firstOk / byEx.size : null;
  const unknownAttempts = attempts.filter((a) => !byId.has(a.exerciseId)).length;
  if (unknownAttempts) caveats.push(`${n(unknownAttempts, "attempt refers", "attempts refer")} to exercises that are not in the library and ${unknownAttempts === 1 ? "is" : "are"} left out of the difficulty figures.`);
  if (attempts.length < T.provisionalAttempts) caveats.push(`Fewer than ${T.provisionalAttempts} attempts recorded (${attempts.length}): difficulty targeting is provisional.`);

  // ---- time spent
  const totalTimeMs = attempts.reduce((s, a) => s + a.timeMs, 0);
  const deepTimes = attempts.filter((a) => a.mode === "deep").map((a) => a.timeMs);
  const flowTimes = attempts.filter((a) => a.mode !== "deep").map((a) => a.timeMs);
  const deepTimeMs = deepTimes.reduce((s, v) => s + v, 0);
  const deepShare = totalTimeMs > 0 ? deepTimeMs / totalTimeMs : null;
  const perMinutes = (times: number[], cfg: { fallback: number; min: number; max: number }) => {
    const m = median(times);
    const observed = m !== null && times.length >= T.minTimeSample;
    return { minutes: observed ? clamp(round1(m / 60000), cfg.min, cfg.max) : cfg.fallback, observed, median: m === null ? null : round1(m / 60000), sample: times.length };
  };
  const perFlow = perMinutes(flowTimes, T.flowMinutes), perDeep = perMinutes(deepTimes, T.deepMinutes);
  const timeReason = (per: typeof perFlow, what: string): Reason => ({
    code: "TIME_PER_EXERCISE",
    text: per.observed ? `Sized at ${per.minutes} min per exercise from your median of ${per.median} min over ${n(per.sample, `${what} attempt`)}.`
      : `Sized at a default ${per.minutes} min per exercise: fewer than ${T.minTimeSample} ${what} attempts are recorded (${per.sample}).`,
    data: { minutesPerExercise: per.minutes, medianMinutes: per.median, sample: per.sample, observed: per.observed },
  });

  // ---- ratings: each stays in its own pool
  const ratings: ParsedRating[] = (profile.ratings ?? []).map((r) => ({
    label: String(r?.label ?? ""), raw: String(r?.value ?? ""), pool: classifyPool(String(r?.label ?? ""), String(r?.value ?? "")),
    value: parseRatingValue(String(r?.value ?? "")), usedAsPrior: false,
  }));
  const unusable = ratings.filter((r) => r.raw.trim() && (r.value === null || r.pool === "unknown"));
  if (unusable.length) caveats.push(`${n(unusable.length, "rating entry", "rating entries")} could not be read as a number in a known pool and ${unusable.length === 1 ? "is" : "are"} not used: ${unusable.map((r) => `"${r.label || "unlabelled"}: ${r.raw}"`).join(", ")}.`);
  if (ratings.some((r) => r.pool === "otb" && r.value !== null) && ratings.some((r) => r.pool === "online" && r.value !== null))
    caveats.push("Over-the-board and online ratings are different pools: they are listed separately and never combined.");

  // ---- difficulty targeting from observed first-try results
  const firstTries = [...byEx.entries()].filter(([id]) => byId.has(id)).map(([id, list]) => ({ d: byId.get(id)!.difficulty, a: list[0] }))
    .sort((x, y) => y.a.ts - x.a.ts).slice(0, T.recentFirstTries);
  const libBands = [...new Set(trainable.map((e) => e.difficulty))].sort((a, b) => a - b);
  const bandKeys = [...new Set([...libBands, ...firstTries.map((f) => f.d)])].sort((a, b) => a - b);
  const bands: BandStat[] = bandKeys.map((difficulty) => {
    const tries = firstTries.filter((f) => f.d === difficulty), ok = tries.filter((f) => f.a.result === "solved").length;
    return { difficulty, firstTries: tries.length, solvedFirstTry: ok, accuracy: tries.length ? ok / tries.length : null, counted: tries.length >= T.minBandSample };
  });
  const counted = bands.filter((b) => b.counted).map((b) => ({ ...b, accuracy: b.accuracy ?? 0 }));
  const bandText = (b: BandStat) => `${b.solvedFirstTry} of ${b.firstTries} recent first tries solved at difficulty ${b.difficulty} (${pct(b.accuracy ?? 0)})`;
  const provisional = attempts.length < T.provisionalAttempts;
  let targetBand: number | null = null, source: DifficultySource = "none", direction: DifficultyDirection = "hold";
  let difficultyReason: Reason | null = null;

  if (libBands.length && counted.length) {
    source = "observed";
    const inRange = counted.filter((b) => b.accuracy >= T.targetLow && b.accuracy <= T.targetHigh);
    const easy = counted.filter((b) => b.accuracy > T.targetHigh), hard = counted.filter((b) => b.accuracy < T.targetLow);
    const range = `${pct(T.targetLow)}–${pct(T.targetHigh)}`;
    let basis: (typeof counted)[number], target: number, text: string;
    if (inRange.length) {
      basis = inRange[inRange.length - 1]; target = basis.difficulty;
      text = `${bandText(basis)}, inside the ${range} target range: stay at difficulty ${target}.`;
    } else if (easy.length) {
      basis = easy[easy.length - 1];
      const from = basis.difficulty, next = libBands.find((d) => d > from);
      if (basis.accuracy > T.tooEasy && firstTries.length >= T.tooEasySample && next !== undefined) {
        target = next; direction = "up";
        text = `${bandText(basis)}, above ${pct(T.tooEasy)} with ${firstTries.length} recent first tries in total: move up to difficulty ${next}.`;
      } else {
        target = from;
        text = `${bandText(basis)}, above the ${range} range; ${next === undefined ? "the library has nothing harder" : `moving up needs more than ${pct(T.tooEasy)} over ${T.tooEasySample}+ first tries (${firstTries.length} recorded)`}: stay at difficulty ${target}.`;
      }
    } else {
      basis = hard[0];
      const from = basis.difficulty, prev = [...libBands].reverse().find((d) => d < from);
      if (basis.accuracy >= T.tooHard) { target = from; text = `${bandText(basis)}, just under the ${range} range but not below ${pct(T.tooHard)}: stay at difficulty ${target}.`; }
      else if (prev !== undefined) { target = prev; direction = "down"; text = `${bandText(basis)}, below ${pct(T.tooHard)}: move down to difficulty ${prev}.`; }
      else { target = from; direction = "deep_shift"; text = `${bandText(basis)}, below ${pct(T.tooHard)}, and the library has nothing easier: keep difficulty ${target} and work it in deep calculation.`; }
    }
    // a band seen in the log may no longer be trainable: snap to the nearest one that is
    if (!libBands.includes(target)) { const t0 = target; target = libBands.reduce((best, d) => (Math.abs(d - t0) < Math.abs(best - t0) ? d : best), libBands[0]); }
    const at = counted.find((b) => b.difficulty === target);
    if (direction === "up" && at && at.accuracy < T.tooHard) { direction = "deep_shift"; text += ` At difficulty ${target}, ${bandText(at)}: work it in deep calculation.`; }
    targetBand = target;
    difficultyReason = { code: "DIFFICULTY_OBSERVED", text, data: { band: basis.difficulty, firstTries: basis.firstTries, solvedFirstTry: basis.solvedFirstTry, accuracy: round2(basis.accuracy), targetBand: target, direction, recentFirstTries: firstTries.length, provisional } };
  } else if (libBands.length) {
    const pick = (table: typeof OTB_PRIOR, v: number) => libBands[Math.round((table.find((row) => v < row.below) ?? table[table.length - 1]).position * (libBands.length - 1))];
    const otb = provisional ? ratings.find((r) => r.pool === "otb" && r.value !== null) : undefined;
    const online = provisional && !otb ? ratings.find((r) => r.pool === "online" && r.value !== null) : undefined;
    const span = `the library's difficulty values run ${libBands[0]}–${libBands[libBands.length - 1]}`;
    const base = { attempts: attempts.length, libraryMin: libBands[0], libraryMax: libBands[libBands.length - 1] };
    if (otb && otb.value !== null) {
      otb.usedAsPrior = true; source = "otb_prior"; targetBand = pick(OTB_PRIOR, otb.value);
      difficultyReason = { code: "DIFFICULTY_OTB_PRIOR", text: `No difficulty band has ${T.minBandSample} first tries yet (${attempts.length} attempts recorded), so the over-the-board rating ${otb.value} ("${otb.label}") sets a provisional starting difficulty of ${targetBand}; ${span}. Recorded results replace this as soon as they exist.`,
        data: { rating: otb.value, pool: "otb", label: otb.label, targetBand, ...base } };
    } else if (online && online.value !== null) {
      online.usedAsPrior = true; source = "online_prior"; targetBand = pick(ONLINE_PRIOR, online.value);
      difficultyReason = { code: "DIFFICULTY_ONLINE_PRIOR", text: `No difficulty band has ${T.minBandSample} first tries yet (${attempts.length} attempts recorded). The online rating ${online.value} ("${online.label}") is used only as a very weak starting hint within its own pool: provisional starting difficulty ${targetBand}; ${span}. Recorded results replace this as soon as they exist.`,
        data: { rating: online.value, pool: "online", label: online.label, targetBand, ...base } };
      caveats.push(`Starting difficulty leans on an online rating ("${online.label}": ${online.value}), which is a very weak hint from its own pool and says nothing about over-the-board strength.`);
    } else {
      source = "book_order"; targetBand = libBands[0];
      difficultyReason = { code: "DIFFICULTY_BOOK_ORDER", text: `No difficulty band has ${T.minBandSample} first tries yet (${attempts.length} attempts recorded) and no usable rating applies: start in book order at difficulty ${targetBand}.`,
        data: { targetBand, minBandSample: T.minBandSample, ...base } };
    }
  }

  // ---- error categories from recorded findings only
  const misses = attempts.filter((a) => a.result !== "solved").slice(-T.recentMisses);
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { evidence: 0, selfReported: 0, weak: 0 }])) as Record<Category, BasisCounts>;
  const missedByCategory = new Map<Category, string[]>();
  let unexplained = 0;
  for (const a of misses) {
    const findings = (a.findings ?? []).filter((f) => f && CATEGORIES.includes(f.category));
    if (!findings.length) { unexplained++; continue; }
    for (const c of CATEGORIES) {            // one miss counts once per category, at its strongest basis
      const bases = findings.filter((f) => f.category === c).map((f) => f.basis);
      if (!bases.length) continue;
      categories[c][bases.includes("evidence") ? "evidence" : bases.includes("self-reported") ? "selfReported" : "weak"]++;
      missedByCategory.set(c, [a.exerciseId, ...(missedByCategory.get(c) ?? []).filter((id) => id !== a.exerciseId)]);   // most recent first
    }
  }
  const score = (c: Category) => categories[c].evidence * T.basisWeight.evidence + categories[c].selfReported * T.basisWeight["self-reported"] + categories[c].weak * T.basisWeight.weak;
  const weakness = CATEGORIES.map((c, i) => ({ c, i, s: score(c) })).filter((x) => x.s >= T.drillMinScore).sort((a, b) => b.s - a.s || a.i - b.i)[0]?.c ?? null;
  const unexplainedReason: Reason | null = unexplained ? {
    code: "UNEXPLAINED_MISSES", text: `${unexplained} of your last ${n(misses.length, "miss", "misses")} ${unexplained === 1 ? "has" : "have"} no recorded findings; ${unexplained === 1 ? "it is" : "they are"} counted as unexplained and not assigned to any category.`,
    data: { unexplained, recentMisses: misses.length },
  } : null;
  if (unexplainedReason) caveats.push(unexplainedReason.text);

  // ---- blocks
  const blocks: TrainingBlock[] = [];
  const used = new Set<string>();
  let budget = dailyGoal;
  const take = (ids: string[]) => { for (const id of ids) used.add(id); budget -= ids.length; return ids; };
  const goalReason = (count: number): Reason => ({ code: "DAILY_GOAL", text: `Capped at ${n(count, "exercise")} by your daily goal of ${dailyGoal} across the whole plan.`, data: { dailyGoal, exercises: count } });

  // 1. due reviews first
  const dueAll = Object.entries(input.srs ?? {}).filter(([, s]) => s && num(s.due, Infinity) <= now).sort((a, b) => a[1].due - b[1].due || a[0].localeCompare(b[0]));
  const due = dueAll.filter(([id]) => byId.get(id)?.trainable);
  const dueSkipped = dueAll.length - due.length;
  if (dueSkipped) caveats.push(`${n(dueSkipped, "due review points", "due reviews point")} to exercises that are missing from the library or not validated, and ${dueSkipped === 1 ? "is" : "are"} skipped.`);
  let reviewMinutes = 0;
  if (due.length) {
    const maxMinutes = Math.min(T.reviewMaxMinutes, Math.floor(sessionMinutes * T.reviewMaxSessionShare));
    const count = Math.max(1, Math.min(due.length, T.reviewCap, Math.ceil(dailyGoal / 2), Math.floor(maxMinutes / T.reviewMinutesEach)));
    const chosen = due.slice(0, count);
    reviewMinutes = Math.min(sessionMinutes, count * T.reviewMinutesEach);
    const remaining = due.length - count;
    const overdueDays = Math.max(0, Math.floor((now - chosen[0][1].due) / DAY_MS));
    const maxLapses = Math.max(...chosen.map(([, s]) => num(s.lapses)));
    const lapsed = chosen.filter(([, s]) => num(s.lapses) >= 2).length;
    const reasons: Reason[] = [{
      code: "REVIEW_DUE",
      text: `${n(due.length, "review is", "reviews are")} due on the spaced-repetition schedule; this block takes the ${count} longest overdue (oldest: ${n(overdueDays, "day")} past due) and ${remaining} remain${remaining === 1 ? "s" : ""} for a later session.`,
      data: { due: due.length, included: count, remaining, oldestOverdueDays: overdueDays, cap: T.reviewCap, dailyGoal, minutesEach: T.reviewMinutesEach },
    }];
    if (lapsed) reasons.push({ code: "REVIEW_LAPSES", text: `${lapsed} of these ${count} ${lapsed === 1 ? "has" : "have"} been missed 2 or more times (most lapses: ${maxLapses}).`, data: { lapsedTwicePlus: lapsed, included: count, maxLapses } });
    blocks.push({ id: "review:due", kind: "due_review", area: "review", title: `Review ${n(count, "due exercise")}`, minutes: reviewMinutes, mode: "review", exerciseIds: take(chosen.map(([id]) => id)), reasons });
  }

  // 2. the rest of the session, split by allocation
  const merged = new Map<AreaKey, { key: AreaKey; label: string; weight: number }>();
  for (const a of profile.allocation ?? []) {
    const w = num(a?.weight);
    if (!a || w <= 0) continue;
    const prev = merged.get(a.key);
    merged.set(a.key, prev ? { ...prev, weight: prev.weight + w } : { key: a.key, label: String(a.label ?? a.key), weight: w });
  }
  let allocation = [...merged.values()];
  if (!allocation.length) {
    caveats.push("No allocation weights are set: the session minutes after reviews go to new calculation material.");
    allocation = [{ key: "calculation", label: "Calculation", weight: 100 }];
  }
  const weightSum = allocation.reduce((s, a) => s + a.weight, 0);
  const areaMinutes = splitMinutes(sessionMinutes - reviewMinutes, allocation.map((a) => a.weight));
  const lastAttemptByBook = new Map<string, number>();
  for (const a of attempts) { const e = byId.get(a.exerciseId); if (e) lastAttemptByBook.set(e.bookId, a.ts); }
  const firstBlockOfArea = new Map<AreaKey, TrainingBlock>();
  const lowDeepShare = attempts.length >= T.deepShareMinAttempts && deepShare !== null && deepShare < T.deepShareLow;

  allocation.forEach((a, k) => {
    const minutes = areaMinutes[k];
    const allocReason: Reason = { code: "ALLOCATION", text: `${a.label}: weight ${a.weight} of ${weightSum} gives ${minutes} of the ${sessionMinutes - reviewMinutes} min left after reviews.`, data: { area: a.key, weight: a.weight, weightTotal: weightSum, minutes, sessionMinutes, reviewMinutes } };
    const gap = (code: ReasonCode, text: string, data: ReasonData = {}) => {
      blocks.push({ id: `gap:area:${a.key}`, kind: "gap", area: a.key, title: `${a.label}: nothing to open here`, minutes, mode: null, exerciseIds: [], reasons: [{ code, text, data: { area: a.key, ...data } }, allocReason] });
    };
    if (a.key === "games") return gap("AREA_OUTSIDE_APP", "Games and postgame analysis happen away from this app; the minutes are reserved, no exercises are substituted.");
    const pool = trainable.filter((e) => areaOf(e.bookId) === a.key);
    if (!pool.length) {
      const waiting = library.filter((e) => !e.trainable && areaOf(e.bookId) === a.key).length;
      return gap("AREA_NO_MATERIAL", `The library has no validated exercises for this area${waiting ? ` (${waiting} imported but not validated)` : ""}; nothing is substituted.`, { trainableExercises: 0, notValidated: waiting });
    }
    if (minutes <= 0) return;
    const made: TrainingBlock[] = [];
    let left = minutes;
    const add = (b: TrainingBlock) => { made.push(b); blocks.push(b); left -= b.minutes; if (!firstBlockOfArea.has(a.key)) firstBlockOfArea.set(a.key, b); };

    if (a.key === "calculation" && minutes >= T.minMinutesToSplit) {
      // weakness drill: only from recorded findings
      if (weakness && budget > 0) {
        const c = categories[weakness], total = c.evidence + c.selfReported + c.weak;
        const eligible = (missedByCategory.get(weakness) ?? []).filter((id) => byId.get(id)?.trainable && !used.has(id));
        const m = Math.max(1, Math.round(minutes * T.drillShare));
        const count = Math.min(eligible.length, budget, Math.max(1, Math.floor(m / perDeep.minutes)));
        if (count > 0) {
          const reasons: Reason[] = [{
            code: "WEAKNESS_FINDINGS",
            text: `${total} of your last ${n(misses.length, "miss", "misses")} ${total === 1 ? "was" : "were"} tagged ${CATEGORY_TEXT[weakness].label}: ${c.evidence} from recorded evidence, ${c.selfReported} self-reported, ${c.weak} from weak signals. ${CATEGORY_TEXT[weakness].drill}`,
            data: { category: weakness, evidence: c.evidence, selfReported: c.selfReported, weak: c.weak, recentMisses: misses.length, score: score(weakness) },
          }];
          if (unexplainedReason) reasons.push(unexplainedReason);
          if (count < eligible.length && count === budget) reasons.push(goalReason(count));
          add({ id: `drill:${weakness}`, kind: "weakness_drill", area: a.key, title: `Drill: ${CATEGORY_TEXT[weakness].label}`, minutes: m, mode: "deep", exerciseIds: take(eligible.slice(0, count)), reasons });
        } else caveats.push(`Recorded findings point to ${CATEGORY_TEXT[weakness].label}, but every exercise carrying that tag is already in today's review or no longer trainable, so no separate drill is added.`);
      }
      // deep calculation: low deep share, or accuracy under the floor at the target band
      if ((lowDeepShare || direction === "deep_shift") && targetBand !== null && budget > 0) {
        const floor = targetBand;
        const eligible = pool.filter((e) => !done.has(e.id) && !used.has(e.id) && e.difficulty >= floor)
          .sort((x, y) => x.difficulty - y.difficulty || x.bookId.localeCompare(y.bookId) || x.number - y.number);
        const m = Math.max(1, Math.round(minutes * T.deepShare));
        const count = Math.min(eligible.length, budget, Math.max(1, Math.floor(m / perDeep.minutes)));
        if (count > 0) {
          const reasons: Reason[] = [];
          if (lowDeepShare && deepShare !== null) reasons.push({ code: "LOW_DEEP_SHARE", text: `Deep calculation is ${pct(deepShare)} of your recorded training time (${Math.round(deepTimeMs / 60000)} of ${Math.round(totalTimeMs / 60000)} min over ${attempts.length} attempts), under the ${pct(T.deepShareLow)} mark.`, data: { deepShare: round2(deepShare), deepMinutes: Math.round(deepTimeMs / 60000), totalMinutes: Math.round(totalTimeMs / 60000), attempts: attempts.length, threshold: T.deepShareLow } });
          if (direction === "deep_shift") reasons.push({ code: "ACCURACY_BELOW_FLOOR", text: `First-try accuracy at difficulty ${floor} is below ${pct(T.tooHard)}, so these are taken slowly with written lines.`, data: { targetBand: floor, floor: T.tooHard } });
          if (difficultyReason) reasons.push(difficultyReason);
          reasons.push(timeReason(perDeep, "deep"));
          const lo = eligible[0].difficulty, hi = eligible[count - 1].difficulty;
          add({ id: "deep:calculation", kind: "deep_calculation", area: a.key, title: `Deep calculation at difficulty ${lo}${hi !== lo ? `–${hi}` : ""}`, minutes: m, mode: "deep", exerciseIds: take(eligible.slice(0, count).map((e) => e.id)), reasons });
        }
      }
    }

    // new material: the first uncleared level, in book order (most recently trained book first)
    const books = [...new Set(pool.map((e) => e.bookId))].sort((x, y) => (lastAttemptByBook.get(y) ?? -Infinity) - (lastAttemptByBook.get(x) ?? -Infinity) || x.localeCompare(y));
    let pick: { level: LevelMeta; levels: LevelMeta[]; fresh: string[] } | null = null;
    for (const bookId of books) {
      const levels = buildLevels(bookId, library, done);
      for (const level of levels.filter((l) => !l.cleared)) {
        const fresh = level.ids.filter((id) => !done.has(id) && !used.has(id));
        if (fresh.length) { pick = { level, levels, fresh }; break; }
      }
      if (pick) break;
    }
    if (pick && budget > 0 && left > 0) {
      const { level, levels, fresh } = pick;
      const mode: Mode = level.boss ? "deep" : "flow", per = mode === "deep" ? perDeep : perFlow;
      const count = Math.min(fresh.length, budget, Math.max(1, Math.floor(left / per.minutes)));
      const bookPool = pool.filter((e) => e.bookId === level.bookId), bookDone = bookPool.filter((e) => done.has(e.id)).length;
      const cleared = levels.filter((l) => l.cleared).length, levelDone = level.ids.filter((id) => done.has(id)).length;
      const need = Math.ceil(level.ids.length * PASS_RATIO);
      const reasons: Reason[] = [
        { code: "BOOK_ORDER", text: `Level ${level.index + 1} of ${levels.length} is the first uncleared level in book order (№ ${level.first}–${level.last}, "${level.title}"); ${levelDone} of its ${level.ids.length} are completed and ${need} clear it.`, data: { levelId: level.id, levelNumber: level.index + 1, levels: levels.length, firstNumber: level.first, lastNumber: level.last, completedInLevel: levelDone, levelSize: level.ids.length, neededToClear: need, difficulty: level.difficulty } },
        { code: "COMPLETED", text: `${bookDone} of ${bookPool.length} validated exercises in this book are completed; ${n(cleared, "level")} cleared.`, data: { completed: bookDone, trainable: bookPool.length, levelsCleared: cleared } },
      ];
      if (level.boss) reasons.push({ code: "BOSS_LEVEL", text: "This is the last level of its chapter, which the campaign plays in deep calculation.", data: { levelId: level.id } });
      if (a.key === "calculation" && difficultyReason) reasons.push(difficultyReason);
      reasons.push(timeReason(per, mode === "deep" ? "deep" : "non-deep"));
      if (count < fresh.length && count === budget) reasons.push(goalReason(count));
      reasons.push(allocReason);
      add({ id: `new:${level.id}`, kind: "new_material", area: a.key, title: `${level.boss ? "Boss level" : `Level ${level.index + 1}`} · № ${level.first}–${level.last}`, minutes: left, mode, exerciseIds: take(fresh.slice(0, count)), bookId: level.bookId, chapterId: level.chapterId, levelId: level.id, reasons });
    } else if (left > 0) {
      const completed = pool.filter((e) => done.has(e.id)).length;
      if (made.length) made[made.length - 1].minutes += left;
      else if (!pick) gap("NO_NEW_MATERIAL", `Every level in this area is cleared or already in today's plan (${completed} of ${pool.length} validated exercises completed); nothing new is left to add.`, { completed, trainableExercises: pool.length });
      else gap("DAILY_GOAL_REACHED", `Your daily goal of ${n(dailyGoal, "exercise")} is already filled by earlier blocks, so no exercises are added here.`, { dailyGoal });
    }
  });

  // 3. repertoire and goals: served by the library, or reported as gaps
  const haystack = trainable.map((e) => ({ e, text: `${norm(e.chapter.title)} | ${norm(e.goal)}` }));
  const matching = (needle: string) => (needle.length >= 3 ? haystack.filter((h) => h.text.includes(needle)).map((h) => h.e) : []);
  const seenIds = new Set(blocks.map((b) => b.id));
  const uniqueId = (id: string) => { let out = id, i = 2; while (seenIds.has(out)) out = `${id}-${i++}`; seenIds.add(out); return out; };
  const repertoire = (profile.repertoire ?? []).filter((r) => r && String(r.opening ?? "").trim()).map((r) => {
    const side = String(r.side ?? ""), opening = String(r.opening).trim(), found = matching(norm(opening));
    if (!found.length) blocks.push({ id: uniqueId(`gap:repertoire:${slug(`${side} ${opening}`)}`), kind: "gap", area: "repertoire", title: `Repertoire: ${opening}${side ? ` (${side})` : ""}`, minutes: 0, mode: null, exerciseIds: [],
      reasons: [{ code: "REPERTOIRE_NO_MATERIAL", text: `No validated exercise in the library has a chapter or goal naming "${opening}"; nothing is substituted.`, data: { side, opening, matchingExercises: 0, trainableExercises: trainable.length } }] });
    else {
      const target = blocks.find((b) => b.kind !== "gap" && found.some((e) => b.exerciseIds.includes(e.id))) ?? firstBlockOfArea.get("repertoire");
      const reason: Reason = { code: "REPERTOIRE_COVERED", text: `${n(found.length, "validated exercise names", "validated exercises name")} your repertoire line "${opening}".`, data: { side, opening, matchingExercises: found.length } };
      if (target) target.reasons.push(reason);
      else caveats.push(`${reason.text} None of them is in this session's blocks.`);
    }
    return { side, opening, matchingExercises: found.length };
  });
  const goals = (profile.goals ?? []).map((g) => String(g ?? "").trim()).filter(Boolean).map((goal) => {
    const text = norm(goal), found = matching(text);
    const area = GOAL_AREAS.find((x) => x.re.test(text))?.area ?? (found.length ? areaOf(found[0].bookId) : null);
    const available = found.length || (area ? trainable.filter((e) => areaOf(e.bookId) === area).length : 0);
    const block = area ? firstBlockOfArea.get(area) : undefined;
    if (!available) blocks.push({ id: uniqueId(`gap:goal:${slug(goal)}`), kind: "gap", area: area ?? "games", title: `Goal: ${goal}`, minutes: 0, mode: null, exerciseIds: [],
      reasons: [{ code: "GOAL_NO_MATERIAL", text: area ? `This goal maps to ${area}, and the library has no validated exercises there; nothing is substituted.` : "No validated exercise in the library matches this goal by area, chapter or tag; nothing is substituted.", data: { goal, area, matchingExercises: 0 } }] });
    else if (block) block.reasons.push({ code: "GOAL_SUPPORTED", text: `Supports your goal "${goal}": ${n(available, "validated exercise")} in the library ${found.length ? "match it by chapter or tag" : `sit in ${area}`}.`, data: { goal, area, matchingExercises: available } });
    else caveats.push(`The library has ${n(available, "validated exercise")} for your goal "${goal}", but this session gives that area no block.`);
    return { goal, area, matchingExercises: available, served: !!available && !!block };
  });

  // ---- summary
  const planned = blocks.reduce((s, b) => s + b.exerciseIds.length, 0);
  const gaps = blocks.filter((b) => b.kind === "gap").length;
  const parts = blocks.filter((b) => b.kind !== "gap").map((b) => `${b.title} (${n(b.exerciseIds.length, "exercise")}, ${b.minutes} min)`);
  const summary = `${sessionMinutes}-minute session: ${parts.length ? parts.join("; ") : "no exercises available"}.${gaps ? ` ${n(gaps, "gap")} the library cannot serve.` : ""}`;

  return {
    version: RECOMMENDER_VERSION, summary,
    skill: { ratings, firstTryAccuracy, difficulty: { targetBand, source, direction, provisional, bands } },
    blocks,
    evidence: {
      totalAttempts: attempts.length, attemptedExercises: byEx.size, completedExercises: done.size,
      libraryExercises: library.length, trainableExercises: trainable.length, firstTryAccuracy,
      totalTimeMs, deepTimeMs, deepShare, medianFlowMinutes: perFlow.median, medianDeepMinutes: perDeep.median,
      dueReviews: due.length, dueReviewsSkipped: dueSkipped, maxLapses: due.reduce((m, [, s]) => Math.max(m, num(s.lapses)), 0),
      recentMisses: misses.length, unexplainedMisses: unexplained, categories,
      sessionMinutes, dailyGoal, exercisesPlanned: planned, repertoire, goals,
    },
    caveats,
  };
}

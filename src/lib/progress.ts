import type { Attempt, Category, Exercise, ProgressState, Srs } from "./types";
import { mergeLocalSave } from "./cloud/merge";
import { notifyLocalWrite } from "./cloud/events";

export const DAY = 86400000;
const LADDER = [1, 3, 7, 16, 35, 80];
export const emptyProgress = (): ProgressState => ({ version: 1, attempts: [], srs: {} });

/** Storage boundary. `save` folds a screen's edits into what is stored instead of
 *  replacing it, so a stale tab or a background sync can never drop attempts.
 *  Only `reset` removes anything. */
export interface ProgressStore { load(): Promise<ProgressState>; save(s: ProgressState): Promise<void>; reset(): Promise<void> }

export const PROGRESS_KEY = "cst.progress.v1";
/** Permanent reset barrier, including resets received from another device. */
export const RESET_KEY = "cst.progress.reset";
const resetKeyFor = (key: string) => key === PROGRESS_KEY ? RESET_KEY : `${key}.reset`;
const readReset = (key: string) => Number(localStorage.getItem(resetKeyFor(key))) || 0;

export function readProgress(key = PROGRESS_KEY, strict = false): ProgressState {
  try {
    const raw = localStorage.getItem(key);
    const s = raw ? (JSON.parse(raw) as ProgressState) : null;
    if (!s || s.version !== 1 || !Array.isArray(s.attempts)) {
      if (strict && raw !== null) throw new Error("Invalid saved progress");
      return emptyProgress();
    }
    const resetAt = readReset(key);
    const attempts = resetAt ? s.attempts.filter(a => a.ts > resetAt) : s.attempts;
    return { version: 1, attempts, srs: rebuildSrs(attempts) };
  } catch (error) { if (strict) throw error; return emptyProgress(); }
}
/** Write without merging. For the sync engine, which has already merged. */
export function writeProgress(s: ProgressState, key = PROGRESS_KEY) { localStorage.setItem(key, JSON.stringify(s)); }

export class LocalProgressStore implements ProgressStore {
  private key: string;
  constructor(key = PROGRESS_KEY) { this.key = key; }
  async load() { return readProgress(this.key); }
  async save(s: ProgressState) {
    this.persist(s);
  }
  /** Apply an intentional edit to the latest stored revision, not a screen's
   * stale copy. In particular, successive reflection edits must retain `rev`. */
  update(edit: (state: ProgressState) => ProgressState): ProgressState {
    return this.persist(edit(readProgress(this.key)));
  }
  private persist(s: ProgressState): ProgressState {
    const resetAt = readReset(this.key);
    const incoming = resetAt ? s.attempts.filter(a => a.ts > resetAt) : s.attempts;
    const attempts = mergeLocalSave(readProgress(this.key).attempts, incoming, Date.now());
    const next: ProgressState = { version: 1, attempts, srs: rebuildSrs(attempts) };
    writeProgress(next, this.key);
    notifyLocalWrite("progress");
    return next;
  }
  async reset() {
    // Persist the reset barrier first. If storage fails, do not erase the log
    // without the marker needed to reject a later save from a stale tab.
    localStorage.setItem(resetKeyFor(this.key), String(Math.max(Date.now(), readReset(this.key))));
    writeProgress(emptyProgress(), this.key);
    notifyLocalWrite("progress");
  }
}

/** Spaced repetition: a miss enters the queue for tomorrow; each clean solve
 *  moves it one rung up the ladder; an assisted solve repeats the rung. */
export function nextSrs(prev: Srs | undefined, result: Attempt["result"], now: number): Srs | undefined {
  if (result === "failed") return { due: now + DAY, intervalDays: 1, lapses: (prev?.lapses ?? 0) + 1 };
  if (!prev) return result === "assisted" ? { due: now + DAY, intervalDays: 1, lapses: 0 } : undefined;
  if (result === "assisted") return { ...prev, due: now + prev.intervalDays * DAY };
  const i = LADDER.indexOf(prev.intervalDays);
  const next = LADDER[Math.min(LADDER.length - 1, i + 1)] ?? prev.intervalDays * 2;
  return { ...prev, intervalDays: next, due: now + next * DAY };
}

export function recordAttempt(state: ProgressState, a: Attempt): ProgressState {
  const srs = { ...state.srs };
  const n = nextSrs(srs[a.exerciseId], a.result, a.ts);
  if (n) srs[a.exerciseId] = n;
  return { ...state, attempts: [...state.attempts, a], srs };
}

/** The spaced-repetition state is a pure function of the attempt log, replayed
 *  in time order. Devices that hold the same attempts agree on what is due. */
export function rebuildSrs(attempts: Attempt[]): Record<string, Srs> {
  const srs: Record<string, Srs> = {};
  for (const a of [...attempts].sort((x, y) => x.ts - y.ts)) {
    const n = nextSrs(srs[a.exerciseId], a.result, a.ts);
    if (n) srs[a.exerciseId] = n;
  }
  return srs;
}

export const dueReviews = (state: ProgressState, now: number): string[] =>
  Object.entries(state.srs).filter(([, s]) => s.due <= now).sort((a, b) => a[1].due - b[1].due).map(([id]) => id);

const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function streak(attempts: Attempt[], now: number): number {
  const days = new Set(attempts.map((a) => dayKey(a.ts)));
  let t = now;
  if (!days.has(dayKey(t))) t -= DAY; // today not trained yet: streak still alive
  let n = 0;
  while (days.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

export interface Stats {
  attempted: number; solved: number; failedIds: string[]; solvedIds: Set<string>;
  /** finished at least once, cleanly or not: what the map and queues count */
  doneIds: Set<string>;
  firstTryAccuracy: number | null; totalAttempts: number; avgAttempts: number; totalTimeMs: number; deepTimeMs: number;
  streak: number; today: number; due: number;
  mostMissed: { id: string; misses: number; attempts: number }[];
  chapters: { bookId: string; chapterId: string; title: string; total: number; solved: number }[];
  categories: Record<Category, { evidence: number; self: number; weak: number }>;
  unexplainedFailures: number;
}

export const CATEGORIES: Category[] = ["missed_candidate", "visualization", "missed_defence", "evaluation", "calculation", "time_management"];

export function computeStats(state: ProgressState, exercises: Exercise[], now: number): Stats {
  const byEx = new Map<string, Attempt[]>();
  for (const a of state.attempts) byEx.set(a.exerciseId, [...(byEx.get(a.exerciseId) ?? []), a]);
  const solvedIds = new Set<string>();
  const doneIds = new Set<string>();
  const failedIds: string[] = [];
  let firstOk = 0;
  const missed: Stats["mostMissed"] = [];
  for (const [id, list] of byEx) {
    if (list.some((a) => a.result === "solved")) solvedIds.add(id);
    if (list.some((a) => a.result !== "failed" || a.finished)) doneIds.add(id);
    else failedIds.push(id);
    if (list[0].result === "solved") firstOk++;
    const misses = list.filter((a) => a.result !== "solved").length;
    if (misses) missed.push({ id, misses, attempts: list.length });
  }
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { evidence: 0, self: 0, weak: 0 }])) as Stats["categories"];
  let unexplained = 0;
  for (const a of state.attempts) {
    if (a.result === "solved") continue;
    if (!a.findings?.length) { unexplained++; continue; }
    for (const f of a.findings) categories[f.category][f.basis === "evidence" ? "evidence" : f.basis === "self-reported" ? "self" : "weak"]++;
  }
  const chap = new Map<string, Stats["chapters"][number]>();
  for (const ex of exercises) {
    const k = `${ex.bookId}/${ex.chapter.id}`;
    const c = chap.get(k) ?? { bookId: ex.bookId, chapterId: ex.chapter.id, title: ex.chapter.title, total: 0, solved: 0 };
    c.total++; if (doneIds.has(ex.id)) c.solved++;
    chap.set(k, c);
  }
  const today = dayKey(now);
  return {
    attempted: byEx.size, solved: solvedIds.size, failedIds, solvedIds, doneIds,
    firstTryAccuracy: byEx.size ? firstOk / byEx.size : null,
    totalAttempts: state.attempts.length, avgAttempts: byEx.size ? state.attempts.length / byEx.size : 0,
    totalTimeMs: state.attempts.reduce((s, a) => s + a.timeMs, 0),
    deepTimeMs: state.attempts.filter((a) => a.mode === "deep").reduce((s, a) => s + a.timeMs, 0),
    streak: streak(state.attempts, now), today: state.attempts.filter((a) => dayKey(a.ts) === today).length,
    due: dueReviews(state, now).length,
    mostMissed: missed.sort((a, b) => b.misses - a.misses || b.attempts - a.attempts).slice(0, 10),
    chapters: [...chap.values()], categories, unexplainedFailures: unexplained,
  };
}

import type { Attempt, Category, Exercise, ProgressState, Srs } from "./types";

export const DAY = 86400000;
const LADDER = [1, 3, 7, 16, 35, 80];
export const emptyProgress = (): ProgressState => ({ version: 1, attempts: [], srs: {} });

/** Storage boundary: swap this for an account-backed adapter to sync later. */
export interface ProgressStore { load(): Promise<ProgressState>; save(s: ProgressState): Promise<void> }

export class LocalProgressStore implements ProgressStore {
  constructor(private key = "cst.progress.v1") {}
  async load() {
    try {
      const raw = localStorage.getItem(this.key);
      const s = raw ? (JSON.parse(raw) as ProgressState) : null;
      return s && s.version === 1 && Array.isArray(s.attempts) ? s : emptyProgress();
    } catch { return emptyProgress(); }
  }
  async save(s: ProgressState) { localStorage.setItem(this.key, JSON.stringify(s)); }
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

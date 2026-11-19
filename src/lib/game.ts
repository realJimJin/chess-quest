import type { Attempt, Exercise, ProgressState } from "./types";
import { isTrainable } from "./validate";

export const LEVEL_SIZE = 12;
export const PASS_RATIO = 0.7;

export interface Level {
  id: string; bookId: string; chapterId: string; index: number; indexInRegion: number;
  exerciseIds: string[]; firstNumber: number; lastNumber: number; boss: boolean;
  solved: number; state: "locked" | "open" | "cleared";
}
export interface Region { bookId: string; chapterId: string; title: string; levels: Level[]; solved: number; total: number; locked: boolean }
export interface Campaign { bookId: string; regions: Region[]; levels: Level[]; current: Level | null }

/** A book becomes a campaign: its real chapters are the regions, split into
 *  levels in book order. The last level of each region is the boss. Only
 *  validated exercises count. */
export function buildCampaign(bookId: string, exercises: Exercise[], solved: Set<string>, freeRoam = false): Campaign {
  const pool = exercises.filter((e) => e.bookId === bookId && isTrainable(e)).sort((a, b) => a.number - b.number);
  const byChapter = new Map<string, Exercise[]>();
  for (const e of pool) byChapter.set(e.chapter.id, [...(byChapter.get(e.chapter.id) ?? []), e]);
  const regions: Region[] = [];
  const levels: Level[] = [];
  let prevCleared = true;
  for (const [chapterId, list] of byChapter) {
    const region: Region = { bookId, chapterId, title: list[0].chapter.title, levels: [], solved: 0, total: list.length, locked: false };
    const chunks: Exercise[][] = [];
    for (let i = 0; i < list.length; i += LEVEL_SIZE) chunks.push(list.slice(i, i + LEVEL_SIZE));
    if (chunks.length > 1 && chunks[chunks.length - 1].length < LEVEL_SIZE / 2) chunks[chunks.length - 2].push(...chunks.pop()!);
    chunks.forEach((chunk, k) => {
      const done = chunk.filter((e) => solved.has(e.id)).length;
      const cleared = done >= Math.ceil(chunk.length * PASS_RATIO);
      const lv: Level = {
        id: `${bookId}:${chapterId}:${k + 1}`, bookId, chapterId, index: levels.length, indexInRegion: k,
        exerciseIds: chunk.map((e) => e.id), firstNumber: chunk[0].number, lastNumber: chunk[chunk.length - 1].number,
        boss: k === chunks.length - 1, solved: done,
        state: cleared ? "cleared" : prevCleared || freeRoam ? "open" : "locked",
      };
      prevCleared = cleared;
      region.levels.push(lv); levels.push(lv); region.solved += done;
    });
    region.locked = region.levels.every((l) => l.state === "locked");
    regions.push(region);
  }
  return { bookId, regions, levels, current: levels.find((l) => l.state === "open") ?? null };
}

/** XP rewards mastery and sustained thought, never raw speed. */
export function xpFor(a: Pick<Attempt, "result" | "mode" | "timeMs" | "deep">, difficulty: number, isReview = false): number {
  const base = 6 + difficulty * 2;
  let xp = a.result === "solved" ? base : a.result === "assisted" ? Math.round(base / 2) : 2;
  if (a.mode === "deep") {
    const minutes = Math.min(a.deep?.plannedMinutes ?? 0, a.timeMs / 60000);
    xp += Math.round(minutes * 2);                      // time actually spent calculating, capped at the plan
    if (a.result === "solved") xp += Math.round(base / 2);
    if (a.deep?.lines.trim()) xp += 3;                  // wrote the analysis down
  }
  if (isReview && a.result === "solved") xp += 5;
  return xp;
}

export function totalXp(progress: ProgressState, byId: Map<string, Exercise>): number {
  const seen = new Set<string>();
  let xp = 0;
  for (const a of progress.attempts) {
    const ex = byId.get(a.exerciseId);
    const repeat = seen.has(a.exerciseId);
    // re-solving an exercise you already solved earns only the review bonus
    const already = repeat && progress.attempts.some((p) => p.exerciseId === a.exerciseId && p.ts < a.ts && p.result === "solved");
    xp += already ? (a.result === "solved" ? 5 : 1) : xpFor(a, ex?.difficulty.value ?? 5, repeat);
    seen.add(a.exerciseId);
  }
  return xp;
}

export interface Rank { level: number; title: string; into: number; span: number }
const TITLES = ["Apprentice", "Calculator", "Tactician", "Combination Hunter", "Analyst", "Candidate", "Strategist", "Expert Track", "Master Track"];
export function rankFor(xp: number): Rank {
  let level = 1, need = 150, left = xp;
  while (left >= need) { left -= need; level++; need = Math.round(need * 1.25); }
  return { level, title: TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))], into: left, span: need };
}

/** Days trained in the last `days`, oldest first — for the activity strip. */
export function activity(attempts: Attempt[], now: number, days = 84): { day: number; count: number }[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime() - (days - 1) * 86400000;
  const out = Array.from({ length: days }, (_, i) => ({ day: t0 + i * 86400000, count: 0 }));
  for (const a of attempts) { const i = Math.floor((a.ts - t0) / 86400000); if (i >= 0 && i < days) out[i].count++; }
  return out;
}

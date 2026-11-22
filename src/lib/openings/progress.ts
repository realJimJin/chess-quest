import type { OpeningSession, OpeningStep } from "./trainer";
import { sessionScore } from "./trainer";
import type { OpeningLine } from "./catalog";

export const OPENING_PROGRESS_KEY = "cq.openings.v1";
export interface LineProgress { runs: number; cleanRuns: number; streak: number; accuracy: number; lastPracticed: number; reviewAt: number; mistakePlies: number[] }
export interface OpeningProgress { version: 1; lines: Record<string, LineProgress> }
export const emptyOpeningProgress = (): OpeningProgress => ({ version: 1, lines: {} });
export interface OpeningProgressStore { load(): OpeningProgress; save(progress: OpeningProgress): void }
const validNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
export function parseOpeningProgress(raw: string | null): OpeningProgress {
  if (!raw) return emptyOpeningProgress();
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !value.lines || typeof value.lines !== "object" || Array.isArray(value.lines)) throw new Error("Unrecognized opening progress");
  for (const p of Object.values(value.lines) as LineProgress[]) {
    if (!p || ![p.runs, p.cleanRuns, p.streak, p.accuracy, p.lastPracticed, p.reviewAt].every(validNumber) || p.accuracy > 100 || !Array.isArray(p.mistakePlies) || !p.mistakePlies.every(v => Number.isInteger(v) && v >= 0)) throw new Error("Invalid opening progress");
  }
  return value;
}
// UI consumes this interface; a future account-backed adapter can replace it.
export const localOpeningProgressStore: OpeningProgressStore = {
  load: () => parseOpeningProgress(localStorage.getItem(OPENING_PROGRESS_KEY)),
  save: progress => localStorage.setItem(OPENING_PROGRESS_KEY, JSON.stringify(progress)),
};
export function recordOpeningRun(progress: OpeningProgress, line: OpeningLine, steps: OpeningStep[], session: OpeningSession, now: number): OpeningProgress {
  if (session.mode !== "recall" || session.ply !== steps.length) return progress;
  const score = sessionScore(steps, line.side, session);
  const prior = progress.lines[line.id];
  const clean = score.accuracy === 100;
  const streak = clean ? (prior?.streak ?? 0) + 1 : 0;
  const days = clean ? [1, 3, 7, 14][Math.min(streak - 1, 3)] : 0;
  return { version: 1, lines: { ...progress.lines, [line.id]: {
    runs: (prior?.runs ?? 0) + 1, cleanRuns: (prior?.cleanRuns ?? 0) + Number(clean), streak,
    accuracy: score.accuracy, lastPracticed: now, reviewAt: now + days * 86400000,
    mistakePlies: [...new Set([...session.mistakes, ...session.assisted])].sort((a, b) => a - b),
  } } };
}

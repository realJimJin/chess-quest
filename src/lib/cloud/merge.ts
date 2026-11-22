// Pure merge rules shared by the browser and the server. Everything here is
// deterministic and order-independent, so two devices that exchange the same
// records always end up with the same state.
import type { Attempt, Exercise, SolNode } from "../types";
import { hashOf } from "./hash";

export const attemptKey = (a: Pick<Attempt, "exerciseId" | "ts">): string => `${a.exerciseId}@${a.ts}`;
const rev = (a: Attempt): number => a.rev ?? 0;

/** Two versions of the same attempt: the later amendment wins; ties break on the
 *  content hash so both sides pick the same one. */
export function pickAttempt(a: Attempt, b: Attempt): Attempt {
  if (rev(a) !== rev(b)) return rev(a) > rev(b) ? a : b;
  return hashOf(a) >= hashOf(b) ? a : b;
}

const byTime = (a: Attempt, b: Attempt) => a.ts - b.ts || (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0);

/** Union of two attempt logs. Attempts at or before `resetAt` were wiped by a
 *  "reset progress" and stay gone. */
export function mergeAttempts(a: Attempt[], b: Attempt[], resetAt = 0): Attempt[] {
  const map = new Map<string, Attempt>();
  for (const x of [...a, ...b]) {
    if (x.ts <= resetAt) continue;
    const k = attemptKey(x);
    const old = map.get(k);
    map.set(k, old ? pickAttempt(old, x) : x);
  }
  return [...map.values()].sort(byTime);
}

/** Fold the edits a screen just made into what is stored on this device.
 *  `incoming` may be a stale in-memory copy, so nothing stored is dropped, and
 *  an attempt whose content changed is stamped as amended now. */
export function mergeLocalSave(stored: Attempt[], incoming: Attempt[], now: number): Attempt[] {
  const map = new Map(stored.map((x) => [attemptKey(x), x]));
  for (const x of incoming) {
    const k = attemptKey(x);
    const old = map.get(k);
    if (!old) { map.set(k, x); continue; }
    if (hashOf(old) === hashOf(x)) continue;
    // an older in-memory copy never overwrites a newer stored one
    if (rev(x) < rev(old)) continue;
    map.set(k, { ...x, rev: Math.max(now, rev(old) + 1) });
  }
  return [...map.values()].sort(byTime);
}

/** Three-way merge of a flat settings document, key by key. A key changed on
 *  one side only keeps that change; changed on both, the remote value wins. */
export function mergeDoc<T extends Record<string, unknown>>(base: T | null, local: T, remote: T): T {
  const out: Record<string, unknown> = { ...remote };
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})])) {
    const b = hashOf(base?.[k]), l = hashOf(local[k]), r = hashOf(remote[k]);
    if (l !== b && r === b) { if (local[k] === undefined) delete out[k]; else out[k] = local[k]; }
  }
  return out as T;
}

const reviewed = (e: Exercise) => e.verification?.reviewedBy === "user";

/** Both sides changed the same exercise. A version the user repaired by hand is
 *  never replaced by one they did not; otherwise the stored (first) one stays. */
export function keepIncomingExercise(stored: Exercise, incoming: Exercise): boolean {
  return reviewed(incoming) && !reviewed(stored);
}

const treeKey = (nodes: SolNode[]): string => nodes.map((n) => `${n.uci}(${treeKey(n.children)})`).join("");

/** Identity of the chess content itself (position and full solution tree),
 *  independent of who owns the copy or how it is annotated. */
export const contentKey = (ex: Pick<Exercise, "fen" | "solution">): string =>
  hashOf([ex.fen.split(" ").slice(0, 4).join(" "), treeKey(ex.solution ?? [])]);

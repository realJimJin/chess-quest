// The sync algorithm, free of browser and network details so it can be tested
// end to end against the real server code. The device stays the source of truth
// for what the user sees; the account is where devices meet.
import type { Attempt } from "../types";
import { hashOf } from "./hash";
import { attemptKey, mergeAttempts, mergeDoc } from "./merge";
import { SyncAccountError, SyncProblem } from "./errors";

export type Doc = Record<string, unknown>;
export interface ProfileDoc { data: Doc; version: number }
export interface Api {
  pull(after: number): Promise<{ attempts: Attempt[]; cursor: number; more: boolean; resetAt: number }>;
  push(body: { attempts: Attempt[]; resetAt?: number }): Promise<{ cursor: number; resetAt: number; stored: number }>;
  getProfile(): Promise<ProfileDoc | null>;
  putProfile(data: Doc, baseVersion: number): Promise<{ ok: boolean; profile: ProfileDoc | null }>;
}
/** What this device knows about the account it last synced with. */
export interface SyncState {
  userId: string; cursor: number;
  /** attempt key -> hash of the version the account is known to hold */
  synced: Record<string, string>;
  profileVersion: number; profileBase: Doc | null;
}
export interface Io {
  api: Api;
  state(): SyncState | null; setState(s: SyncState): void;
  attempts(): Attempt[]; setAttempts(a: Attempt[]): void;
  /** Permanent local reset barrier; acknowledgement never removes it. */
  resetAt(): number; applyReset(at: number): void;
  profile(): Doc | null; setProfile(d: Doc): void;
}

export const PUSH_CHUNK = 500;
export const freshState = (userId: string): SyncState => ({ userId, cursor: 0, synced: {}, profileVersion: 0, profileBase: null });
const stateFor = (io: Io, userId: string): SyncState => {
  const s = io.state();
  if (s && s.userId !== userId) throw new SyncAccountError();
  if (s) return { ...s, synced: { ...s.synced } };
  // Bind device data before the first request, even when the request fails.
  const fresh = freshState(userId);
  io.setState(fresh);
  return fresh;
};
const same = (a: Attempt[], b: Attempt[]) => a.length === b.length && hashOf(a) === hashOf(b);

/** Pull what other devices recorded, merge it with this device, push what the account lacks. */
export async function syncProgress(io: Io, userId: string): Promise<{ pulled: number; pushed: number }> {
  const st = stateFor(io, userId);
  const remote: Attempt[] = [];
  let resetAt = 0;
  for (;;) {
    const page = await io.api.pull(st.cursor);
    stateFor(io, userId);
    remote.push(...page.attempts); resetAt = page.resetAt; st.cursor = page.cursor;
    if (!page.more) break;
  }
  for (const a of remote) st.synced[attemptKey(a)] = hashOf(a);

  // No await between reading and writing local data, so a save made meanwhile is not lost.
  const reset = io.resetAt();
  io.applyReset(Math.max(resetAt, reset));
  const local = io.attempts();
  const merged = mergeAttempts(local, remote, Math.max(resetAt, reset));
  if (!same(local, merged)) io.setAttempts(merged);

  const keys = new Set(merged.map(attemptKey));
  for (const k of Object.keys(st.synced)) if (!keys.has(k)) delete st.synced[k];
  const todo = merged.filter((a) => st.synced[attemptKey(a)] !== hashOf(a));
  let pushed = 0;
  for (let i = 0; i < todo.length || (i === 0 && reset > resetAt); i += PUSH_CHUNK) {
    const chunk = todo.slice(i, i + PUSH_CHUNK);
    const r = await io.api.push({ attempts: chunk, ...(i === 0 && reset > resetAt ? { resetAt: reset } : {}) });
    stateFor(io, userId);
    io.applyReset(r.resetAt);
    for (const a of chunk) st.synced[attemptKey(a)] = hashOf(a);
    // If ours was the very next change, nothing else can be in between and the pull can skip it.
    if (r.cursor === st.cursor + 1) st.cursor = r.cursor;
    pushed += chunk.length;
    io.setState(st);
  }
  io.setState(st);
  return { pulled: remote.length, pushed };
}

/** Three-way merge of the profile: a field changed on one side keeps that
 *  change; changed on both, the account's value wins. */
export async function syncProfile(io: Io, userId: string): Promise<void> {
  let st = stateFor(io, userId);
  let remote = await io.api.getProfile();
  for (let tries = 0; tries < 4; tries++) {
    stateFor(io, userId);
    if (remote && remote.version !== st.profileVersion) {
      const local = io.profile();
      const merged = mergeDoc(st.profileBase, local ?? {}, remote.data);
      if (!local || hashOf(local) !== hashOf(merged)) io.setProfile(merged);
      st = { ...stateFor(io, userId), profileVersion: remote.version, profileBase: remote.data };
      io.setState(st);
    }
    const local = io.profile();
    if (!local || (remote && hashOf(local) === hashOf(remote.data))) return;
    const r = await io.api.putProfile(local, remote?.version ?? 0);
    stateFor(io, userId);
    if (r.ok && r.profile) {
      io.setState({ ...stateFor(io, userId), profileVersion: r.profile.version, profileBase: r.profile.data });
      return;
    }
    remote = r.profile ?? await io.api.getProfile(); // someone else saved first: merge and try again
  }
  throw new SyncProblem("The profile changed on another device while syncing. Try Sync now again.");
}

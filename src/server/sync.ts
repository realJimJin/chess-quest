// Progress and profile sync. Clients push what changed and pull everything
// stamped after their cursor; the merge rules are the same pure functions the
// browser uses (src/lib/cloud/merge.ts), so every device converges.
import type { Attempt, Srs } from "../lib/types";
import { hashOf, stableStringify } from "../lib/cloud/hash";
import { attemptKey, pickAttempt } from "../lib/cloud/merge";
import { rebuildSrs } from "../lib/progress";
import { asUser, j, num, type Db, type Sql } from "./db";

export class SyncError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** One push stamps all its rows with a single change number, and a pull page
 *  always holds whole pushes, so the page must be at least as large as a push. */
export const MAX_PUSH = 500;
export const PAGE = 1000;
const MAX_ATTEMPT_BYTES = 16_000;
const MAX_PROFILE_BYTES = 64_000;
const CLOCK_SLACK_MS = 10 * 60_000;       // how far ahead of the server a client clock may run
const MODES = new Set(["flow", "deep", "review", "focus"]);
const RESULTS = new Set(["solved", "assisted", "failed"]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const origin = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 64) : null);

function checkAttempt(v: unknown, now: number): Attempt {
  if (!isObj(v)) throw new SyncError("attempt must be an object");
  const a = v as unknown as Attempt;
  if (typeof a.exerciseId !== "string" || !a.exerciseId || a.exerciseId.length > 200) throw new SyncError("attempt.exerciseId is invalid");
  if (!isInt(a.ts, 1, now + CLOCK_SLACK_MS)) throw new SyncError("attempt.ts is invalid or in the future");
  if (!MODES.has(a.mode)) throw new SyncError("attempt.mode is invalid");
  if (!RESULTS.has(a.result)) throw new SyncError("attempt.result is invalid");
  if (typeof a.timeMs !== "number" || !Number.isFinite(a.timeMs) || a.timeMs < 0) throw new SyncError("attempt.timeMs is invalid");
  if (a.hintLevel !== undefined && !isInt(a.hintLevel, 0, 100)) throw new SyncError("attempt.hintLevel is invalid");
  if (a.rev !== undefined && !isInt(a.rev, 0, now + CLOCK_SLACK_MS)) throw new SyncError("attempt.rev is invalid");
  if (stableStringify(a).length > MAX_ATTEMPT_BYTES) throw new SyncError("attempt is too large", 413);
  return a;
}

/** Lock the account row. Everything that stamps rows holds this lock, which is
 *  what makes "all rows after cursor N" complete for a reader. */
async function lockUser(q: Sql, userId: string): Promise<{ seq: number; resetAt: number }> {
  const rows = await q.query("select change_seq, progress_reset_at from users where id = $1 for update", [userId]);
  if (!rows.length) throw new SyncError("account not found", 404);
  return { seq: num(rows[0].change_seq), resetAt: num(rows[0].progress_reset_at) };
}
async function nextSeq(q: Sql, userId: string): Promise<number> {
  const rows = await q.query("update users set change_seq = change_seq + 1 where id = $1 returning change_seq", [userId]);
  return num(rows[0].change_seq);
}

async function writeSrs(q: Sql, userId: string, exerciseIds: string[] | "all") {
  const where = exerciseIds === "all" ? "" : "and exercise_id in (select jsonb_array_elements_text($2::text::jsonb))";
  const params = exerciseIds === "all" ? [userId] : [userId, j(exerciseIds)];
  const rows = await q.query(`select payload from attempts where user_id = $1 ${where}`, params);
  const srs: Record<string, Srs> = rebuildSrs(rows.map((r) => r.payload as Attempt));
  await q.query(`delete from srs_state where user_id = $1 ${where}`, params);
  const list = Object.entries(srs).map(([exercise_id, s]) => ({ exercise_id, due: s.due, interval_days: s.intervalDays, lapses: s.lapses }));
  if (list.length) await q.query(
    `insert into srs_state (user_id, exercise_id, due, interval_days, lapses)
     select $1, x.exercise_id, x.due, x.interval_days, x.lapses
     from jsonb_to_recordset($2::text::jsonb) as x(exercise_id text, due bigint, interval_days int, lapses int)`,
    [userId, j(list)]);
}

export interface PushProgress { attempts?: unknown[]; resetAt?: unknown; origin?: unknown }
export interface PushResult { cursor: number; resetAt: number; stored: number }

/** Merge a device's attempts into the account. Idempotent: pushing the same
 *  attempts again stores nothing and does not move the cursor. */
export async function pushProgress(db: Db, userId: string, body: PushProgress, now = Date.now()): Promise<PushResult> {
  const raw = body.attempts ?? [];
  if (!Array.isArray(raw)) throw new SyncError("attempts must be an array");
  if (raw.length > MAX_PUSH) throw new SyncError(`at most ${MAX_PUSH} attempts per request`, 413);
  const incoming = new Map<string, Attempt>();
  for (const v of raw) {
    const a = checkAttempt(v, now);
    const old = incoming.get(attemptKey(a));
    incoming.set(attemptKey(a), old ? pickAttempt(old, a) : a);
  }
  let wantReset = 0;
  if (body.resetAt !== undefined && body.resetAt !== null) {
    if (!isInt(body.resetAt, 0, now + CLOCK_SLACK_MS)) throw new SyncError("resetAt is invalid or in the future");
    wantReset = body.resetAt;
  }
  const from = origin(body.origin);

  return asUser(db, userId, async (q) => {
    const user = await lockUser(q, userId);
    const resetAt = Math.max(user.resetAt, wantReset);
    const didReset = resetAt > user.resetAt;
    if (didReset) {
      await q.query("delete from attempts where user_id = $1 and ts <= $2", [userId, resetAt]);
      await q.query("update users set progress_reset_at = $2 where id = $1", [userId, resetAt]);
    }

    const live = [...incoming.values()].filter((a) => a.ts > resetAt);
    const stored = new Map<string, { hash: string; payload: Attempt }>();
    if (live.length) {
      const rows = await q.query(
        `select a.exercise_id, a.ts, a.hash, a.payload from attempts a
         join jsonb_to_recordset($2::text::jsonb) as k(exercise_id text, ts bigint) on k.exercise_id = a.exercise_id and k.ts = a.ts
         where a.user_id = $1`,
        [userId, j(live.map((a) => ({ exercise_id: a.exerciseId, ts: a.ts })))]);
      for (const r of rows) stored.set(`${r.exercise_id}@${num(r.ts)}`, { hash: r.hash, payload: r.payload as Attempt });
    }
    const changed: Attempt[] = [];
    for (const a of live) {
      const old = stored.get(attemptKey(a));
      const winner = old ? pickAttempt(old.payload, a) : a;
      if (!old || hashOf(winner) !== old.hash) changed.push(winner);
    }

    let cursor = user.seq;
    if (changed.length || didReset) cursor = await nextSeq(q, userId);
    if (changed.length) {
      await q.query(
        `insert into attempts (user_id, exercise_id, ts, mode, result, time_ms, hint_level, finished, payload, hash, seq, origin)
         select $1, x.exercise_id, x.ts, x.mode, x.result, x.time_ms, x.hint_level, x.finished, x.payload, x.hash, $3, $4
         from jsonb_to_recordset($2::text::jsonb) as x(exercise_id text, ts bigint, mode text, result text, time_ms bigint, hint_level int, finished boolean, payload jsonb, hash text)
         on conflict (user_id, exercise_id, ts) do update set
           mode = excluded.mode, result = excluded.result, time_ms = excluded.time_ms, hint_level = excluded.hint_level,
           finished = excluded.finished, payload = excluded.payload, hash = excluded.hash, seq = excluded.seq,
           origin = excluded.origin, updated_at = now()`,
        [userId, j(changed.map((a) => ({
          exercise_id: a.exerciseId, ts: a.ts, mode: a.mode, result: a.result, time_ms: Math.round(a.timeMs),
          hint_level: a.hintLevel ?? 0, finished: !!a.finished, payload: a, hash: hashOf(a),
        }))), cursor, from]);
    }
    if (didReset) await writeSrs(q, userId, "all");
    else if (changed.length) await writeSrs(q, userId, [...new Set(changed.map((a) => a.exerciseId))]);
    return { cursor, resetAt, stored: changed.length };
  });
}

export interface PullResult { attempts: Attempt[]; cursor: number; more: boolean; resetAt: number }

/** Everything stamped after `after`, oldest change first, in whole pushes.
 *  Call again with the returned cursor while `more` is true. */
export async function pullProgress(db: Db, userId: string, after: number, limit = PAGE): Promise<PullResult> {
  if (!isInt(after, 0, Number.MAX_SAFE_INTEGER)) throw new SyncError("cursor is invalid");
  const page = Math.max(MAX_PUSH, Math.min(limit, PAGE));
  return asUser(db, userId, async (q) => {
    // Read the head first: rows stamped later than this are left for the next pull.
    const head = await q.query("select change_seq, progress_reset_at from users where id = $1", [userId]);
    if (!head.length) throw new SyncError("account not found", 404);
    const top = num(head[0].change_seq), resetAt = num(head[0].progress_reset_at);
    const rows = await q.query(
      "select payload, seq from attempts where user_id = $1 and seq > $2 and seq <= $3 order by seq, exercise_id, ts limit $4",
      [userId, after, top, page + 1]);
    if (rows.length <= page) return { attempts: rows.map((r) => r.payload as Attempt), cursor: top, more: false, resetAt };
    // The page is full: stop at the last push that fits completely.
    const cut = num(rows[page].seq);
    const whole = rows.filter((r) => num(r.seq) < cut);
    return { attempts: whole.map((r) => r.payload as Attempt), cursor: cut - 1, more: true, resetAt };
  });
}

/** The server's view of what is due, for clients that only need the queue. */
export async function dueReviews(db: Db, userId: string, now = Date.now(), limit = 200): Promise<string[]> {
  const rows = await asUser(db, userId, (q) => q.query(
    "select exercise_id from srs_state where user_id = $1 and due <= $2 order by due, exercise_id limit $3", [userId, now, Math.min(limit, 1000)]));
  return rows.map((r) => r.exercise_id as string);
}

export interface ProfileDoc { data: Record<string, unknown>; version: number }
export type PutProfileResult = { ok: true; profile: ProfileDoc } | { ok: false; profile: ProfileDoc | null };

export async function getProfile(db: Db, userId: string): Promise<ProfileDoc | null> {
  const rows = await asUser(db, userId, (q) => q.query("select data, version from profiles where user_id = $1", [userId]));
  return rows.length ? { data: rows[0].data, version: num(rows[0].version) } : null;
}

/** Save the profile if the caller has seen the current version (0 = none yet).
 *  On a mismatch nothing is written and the current profile comes back, so the
 *  client can merge (mergeDoc) and try again. */
export async function putProfile(db: Db, userId: string, body: { data?: unknown; baseVersion?: unknown; origin?: unknown }): Promise<PutProfileResult> {
  if (!isObj(body.data)) throw new SyncError("profile data must be an object");
  if (!isInt(body.baseVersion, 0, 2_000_000_000)) throw new SyncError("baseVersion is invalid");
  const data = body.data, base = body.baseVersion, from = origin(body.origin);
  if (stableStringify(data).length > MAX_PROFILE_BYTES) throw new SyncError("profile is too large", 413);
  return asUser(db, userId, async (q) => {
    await lockUser(q, userId);
    const cur = await q.query("select data, version from profiles where user_id = $1", [userId]);
    const current: ProfileDoc | null = cur.length ? { data: cur[0].data, version: num(cur[0].version) } : null;
    if ((current?.version ?? 0) !== base) return { ok: false as const, profile: current };
    if (current && hashOf(current.data) === hashOf(data)) return { ok: true as const, profile: current };
    const seq = await nextSeq(q, userId);
    await q.query(
      `insert into profiles (user_id, data, version, seq, origin) values ($1, $2::text::jsonb, 1, $3, $4)
       on conflict (user_id) do update set data = excluded.data, version = profiles.version + 1, seq = excluded.seq, origin = excluded.origin, updated_at = now()`,
      [userId, j(data), seq, from]);
    return { ok: true as const, profile: { data, version: base + 1 } };
  });
}

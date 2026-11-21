import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Attempt } from "../../lib/types";
import { rebuildSrs } from "../../lib/progress";
import { asUser, type Db } from "../db";
import { ensureUser } from "../users";
import { MAX_PUSH, dueReviews, getProfile, pullProgress, pushProgress, putProfile } from "../sync";
import { testDb } from "./helpers";

const NOW = 1_800_000_000_000;
const att = (exerciseId: string, ts: number, result: Attempt["result"] = "solved", extra: Partial<Attempt> = {}): Attempt =>
  ({ exerciseId, ts, mode: "flow", result, timeMs: 1234, wrongMoves: [], offBookMoves: [], hintLevel: 0, finished: true, ...extra });

let db: Db;
let n = 0;
const newUser = () => ensureUser(db, { sub: `auth0|sync${++n}`, email: `s${n}@example.test`, emailVerified: true });
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

describe("ensureUser", () => {
  it("creates once and returns the same account afterwards", async () => {
    const a = await ensureUser(db, { sub: "auth0|same", email: "a@example.test", name: "A" });
    const b = await ensureUser(db, { sub: "auth0|same", email: "b@example.test" });
    expect(b).toBe(a);
    const rows = await asUser(db, a, (q) => q.query("select email, name from users"));
    expect(rows).toEqual([{ email: "b@example.test", name: "A" }]);
    await expect(ensureUser(db, { sub: "" })).rejects.toThrow(/subject/);
  });
});

describe("progress sync", () => {
  it("stores attempts, and a repeat push changes nothing", async () => {
    const u = await newUser();
    const batch = [att("e1", NOW - 3000, "failed"), att("e2", NOW - 2000)];
    const first = await pushProgress(db, u, { attempts: batch, origin: "phone" }, NOW);
    expect(first).toEqual({ cursor: 1, resetAt: 0, stored: 2 });
    const again = await pushProgress(db, u, { attempts: batch, origin: "phone" }, NOW);
    expect(again).toEqual({ cursor: 1, resetAt: 0, stored: 0 });
    const pulled = await pullProgress(db, u, 0);
    expect(pulled.cursor).toBe(1);
    expect(pulled.more).toBe(false);
    expect(pulled.attempts).toEqual(batch);
    expect((await pullProgress(db, u, 1)).attempts).toEqual([]);
  });

  it("a pull after the cursor returns only newer changes", async () => {
    const u = await newUser();
    await pushProgress(db, u, { attempts: [att("e1", NOW - 5000)] }, NOW);
    const { cursor } = await pushProgress(db, u, { attempts: [att("e2", NOW - 4000)] }, NOW);
    await pushProgress(db, u, { attempts: [att("e3", NOW - 3000)] }, NOW);
    const pulled = await pullProgress(db, u, cursor);
    expect(pulled.attempts.map((a) => a.exerciseId)).toEqual(["e3"]);
    expect(pulled.cursor).toBe(3);
  });

  it("an amended attempt replaces the stored one; a stale copy does not", async () => {
    const u = await newUser();
    const base = att("e1", NOW - 9000, "failed");
    await pushProgress(db, u, { attempts: [base] }, NOW);
    const amended = { ...base, selfReport: ["calculation" as const], rev: NOW - 100 };
    expect((await pushProgress(db, u, { attempts: [amended] }, NOW)).stored).toBe(1);
    expect((await pushProgress(db, u, { attempts: [base] }, NOW)).stored).toBe(0);
    const all = await pullProgress(db, u, 0);
    expect(all.attempts).toEqual([amended]);
  });

  it("two devices pushing different attempts both converge", async () => {
    const u = await newUser();
    const phone = [att("e1", NOW - 9000, "failed"), att("e1", NOW - 5000)];
    const laptop = [att("e1", NOW - 7000, "assisted"), att("e2", NOW - 6000, "failed")];
    await pushProgress(db, u, { attempts: phone, origin: "phone" }, NOW);
    await pushProgress(db, u, { attempts: laptop, origin: "laptop" }, NOW);
    const all = (await pullProgress(db, u, 0)).attempts;
    expect(all.length).toBe(4);
    const want = rebuildSrs([...phone, ...laptop]);
    const rows = await asUser(db, u, (q) => q.query("select exercise_id, due, interval_days, lapses from srs_state order by exercise_id"));
    expect(rows.map((r) => [r.exercise_id, Number(r.due), r.interval_days, r.lapses]))
      .toEqual(Object.entries(want).sort().map(([id, s]) => [id, s.due, s.intervalDays, s.lapses]));
    expect(await dueReviews(db, u, NOW + 400 * 86400000)).toEqual(Object.entries(want).sort((a, b) => a[1].due - b[1].due).map(([id]) => id));
    expect(await dueReviews(db, u, NOW - 86400000)).toEqual([]);
  });

  it("reset wipes older attempts everywhere and they cannot come back", async () => {
    const u = await newUser();
    const old = att("e1", NOW - 9000, "failed"), fresh = att("e2", NOW - 1000, "failed");
    await pushProgress(db, u, { attempts: [old, fresh] }, NOW);
    const r = await pushProgress(db, u, { resetAt: NOW - 5000 }, NOW);
    expect(r).toEqual({ cursor: 2, resetAt: NOW - 5000, stored: 0 });
    // another device that has not heard of the reset uploads the old attempt again
    expect((await pushProgress(db, u, { attempts: [old] }, NOW)).stored).toBe(0);
    const all = await pullProgress(db, u, 0);
    expect(all.resetAt).toBe(NOW - 5000);
    expect(all.attempts).toEqual([fresh]);
    const srs = await asUser(db, u, (q) => q.query("select exercise_id from srs_state"));
    expect(srs.map((x) => x.exercise_id)).toEqual(["e2"]);
    // an older reset never moves the mark backwards
    expect((await pushProgress(db, u, { resetAt: NOW - 8000 }, NOW)).resetAt).toBe(NOW - 5000);
  });

  it("pages in whole pushes when there is more than one page", async () => {
    const u = await newUser();
    for (let p = 0; p < 3; p++) {
      const batch = Array.from({ length: MAX_PUSH }, (_, i) => att(`p${p}-${i}`, NOW - 100000 + p * 1000 + i));
      await pushProgress(db, u, { attempts: batch }, NOW);
    }
    const one = await pullProgress(db, u, 0);
    expect([one.attempts.length, one.cursor, one.more]).toEqual([1000, 2, true]);
    const two = await pullProgress(db, u, one.cursor);
    expect([two.attempts.length, two.cursor, two.more]).toEqual([500, 3, false]);
    expect(new Set([...one.attempts, ...two.attempts].map((a) => a.exerciseId)).size).toBe(1500);
  });

  it("rejects malformed input and never touches another account", async () => {
    const u = await newUser(), other = await newUser();
    await pushProgress(db, other, { attempts: [att("secret", NOW - 1)] }, NOW);
    await expect(pushProgress(db, u, { attempts: [{ ...att("e", NOW), mode: "cheat" }] }, NOW)).rejects.toThrow(/mode/);
    await expect(pushProgress(db, u, { attempts: [att("e", NOW + 86400000)] }, NOW)).rejects.toThrow(/future/);
    await expect(pushProgress(db, u, { attempts: [att("e", NOW, "solved", { timeMs: -1 })] }, NOW)).rejects.toThrow(/timeMs/);
    await expect(pushProgress(db, u, { attempts: [att("e", NOW, "solved", { wrongMoves: ["x".repeat(20000)] })] }, NOW)).rejects.toThrow(/large/);
    await expect(pushProgress(db, u, { attempts: Array(MAX_PUSH + 1).fill(att("e", NOW)) }, NOW)).rejects.toThrow(/at most/);
    await expect(pushProgress(db, u, { resetAt: NOW + 86400000 }, NOW)).rejects.toThrow(/resetAt/);
    await expect(pullProgress(db, u, -1)).rejects.toThrow(/cursor/);
    expect((await pullProgress(db, u, 0)).attempts).toEqual([]);
    await pushProgress(db, u, { resetAt: NOW }, NOW);
    expect((await pullProgress(db, other, 0)).attempts.length).toBe(1);
  });
});

describe("profile sync", () => {
  it("saves with optimistic versions and reports conflicts without writing", async () => {
    const u = await newUser();
    expect(await getProfile(db, u)).toBeNull();
    const a = await putProfile(db, u, { data: { name: "Jim", goal: 20 }, baseVersion: 0, origin: "phone" });
    expect(a).toEqual({ ok: true, profile: { data: { name: "Jim", goal: 20 }, version: 1 } });
    const stale = await putProfile(db, u, { data: { name: "Other" }, baseVersion: 0 });
    expect(stale).toEqual({ ok: false, profile: { data: { name: "Jim", goal: 20 }, version: 1 } });
    const same = await putProfile(db, u, { data: { goal: 20, name: "Jim" }, baseVersion: 1 });
    expect(same.profile?.version).toBe(1);
    const b = await putProfile(db, u, { data: { name: "Jim", goal: 30 }, baseVersion: 1 });
    expect(b).toEqual({ ok: true, profile: { data: { name: "Jim", goal: 30 }, version: 2 } });
    expect(await getProfile(db, u)).toEqual({ data: { name: "Jim", goal: 30 }, version: 2 });
    await expect(putProfile(db, u, { data: [1], baseVersion: 2 })).rejects.toThrow(/object/);
    await expect(putProfile(db, u, { data: { x: "y".repeat(70000) }, baseVersion: 2 })).rejects.toThrow(/large/);
  });
});

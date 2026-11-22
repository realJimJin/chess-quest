// The browser's sync engine driven against the real route handlers and an
// in-memory database: two devices on one account must converge.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Attempt } from "../../lib/types";
import { mergeLocalSave } from "../../lib/cloud/merge";
import { syncProfile, syncProgress, type Api, type Doc, type Io, type SyncState } from "../../lib/cloud/engine";
import { SYNC_ACCOUNT_HEADER, SyncAccountError } from "../../lib/cloud/errors";
import type { Db } from "../db";
import { ensureUser } from "../users";
import { profileGet, profilePut, progressGet, progressPost, type Deps } from "../http";
import { testDb } from "./helpers";

const BASE = "https://app.example.test";
let db: Db;
beforeAll(async () => { db = await testDb(); });
afterAll(async () => { await db.close(); });

let calls = 0;
function apiFor(sub: string): Api {
  const deps: Deps = { ready: () => true, db: async () => db, identify: async () => ({ identity: { sub }, via: "cookie" }), baseUrl: () => BASE };
  const ok = async (r: Response) => { calls++; const body = await r.json(); if (!r.ok && !(r.status === 409 && body.ok === false && "profile" in body)) throw new Error(`${r.status} ${JSON.stringify(body)}`); return body; };
  const request = async (path: string, method = "GET", body?: unknown) => new Request(BASE + path, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { origin: BASE, [SYNC_ACCOUNT_HEADER]: await ensureUser(db, { sub }) },
  });
  return {
    pull: async (after) => ok(await progressGet(await request(`/api/sync/progress?after=${after}`), deps)),
    push: async (body) => ok(await progressPost(await request("/api/sync/progress", "POST", body), deps)),
    getProfile: async () => (await ok(await profileGet(await request("/api/sync/profile"), deps))).profile,
    putProfile: async (data, baseVersion) => ok(await profilePut(await request("/api/sync/profile", "PUT", { data, baseVersion }), deps)),
  };
}
class Device implements Io {
  api: Api; st: SyncState | null = null; list: Attempt[] = []; reset = 0; prof: Doc | null = null;
  constructor(sub: string) { this.api = apiFor(sub); }
  state() { return this.st; } setState(s: SyncState) { this.st = structuredClone(s); }
  attempts() { return this.list; } setAttempts(a: Attempt[]) { this.list = a; }
  resetAt() { return this.reset; } applyReset(at: number) { this.reset = Math.max(this.reset, at); }
  profile() { return this.prof; } setProfile(d: Doc) { this.prof = d; }
  solve(id: string, ts: number, extra: Partial<Attempt> = {}) { this.list = mergeLocalSave(this.list, [att(id, ts, extra)], Date.now()); }
  ids() { return this.list.map((a) => a.exerciseId); }
}
const T = Date.now() - 3_600_000;
const att = (exerciseId: string, ts: number, extra: Partial<Attempt> = {}): Attempt =>
  ({ exerciseId, ts, mode: "flow", result: "solved", timeMs: 1000, wrongMoves: [], offBookMoves: [], hintLevel: 0, finished: true, ...extra });
let n = 0;
const account = async () => { const sub = `auth0|client${++n}`; return { sub, id: await ensureUser(db, { sub }) }; };

describe("client sync against the real routes", () => {
  it("two devices converge, and work done before signing in is kept", async () => {
    const { sub, id } = await account();
    const phone = new Device(sub), laptop = new Device(sub);
    phone.solve("a", T + 1); phone.solve("b", T + 2);
    laptop.solve("c", T + 3);
    expect(await syncProgress(phone, id)).toEqual({ pulled: 0, pushed: 2 });
    expect(await syncProgress(laptop, id)).toEqual({ pulled: 2, pushed: 1 });
    await syncProgress(phone, id);
    expect(phone.ids()).toEqual(["a", "b", "c"]);
    expect(laptop.ids()).toEqual(["a", "b", "c"]);
    // nothing new: a further sync sends nothing and pulls nothing
    expect(await syncProgress(phone, id)).toEqual({ pulled: 0, pushed: 0 });
    expect(await syncProgress(laptop, id)).toEqual({ pulled: 0, pushed: 0 });
  });

  it("an amended attempt reaches the other device", async () => {
    const { sub, id } = await account();
    const a = new Device(sub), b = new Device(sub);
    a.solve("x", T + 1); await syncProgress(a, id); await syncProgress(b, id);
    b.solve("x", T + 1, { result: "assisted", hintLevel: 2 });
    expect(await syncProgress(b, id)).toMatchObject({ pushed: 1 });
    await syncProgress(a, id);
    expect(a.list).toHaveLength(1);
    expect(a.list[0]).toMatchObject({ result: "assisted", hintLevel: 2 });
  });

  it("a reset on one device empties the account and the other device, keeping later work", async () => {
    const { sub, id } = await account();
    const a = new Device(sub), b = new Device(sub);
    a.solve("old1", T + 1); b.solve("old2", T + 2);
    await syncProgress(a, id); await syncProgress(b, id); await syncProgress(a, id);
    a.list = []; a.reset = T + 10; a.solve("new", T + 20);
    await syncProgress(a, id);
    expect(a.reset).toBe(T + 10);
    await syncProgress(b, id);
    expect(b.ids()).toEqual(["new"]);
    expect(b.reset).toBe(T + 10);
    expect(Object.keys(b.st!.synced)).toEqual([`new@${T + 20}`]);
    const fresh = new Device(sub); await syncProgress(fresh, id);
    expect(fresh.ids()).toEqual(["new"]);
  });

  it("pushes a large backlog in chunks", async () => {
    const { sub, id } = await account();
    const a = new Device(sub), b = new Device(sub);
    a.list = Array.from({ length: 1201 }, (_, i) => att(`e${i}`, T + i));
    expect(await syncProgress(a, id)).toEqual({ pulled: 0, pushed: 1201 });
    expect((await syncProgress(b, id)).pulled).toBe(1201);
    expect(b.list).toHaveLength(1201);
  });

  it("a failed sync loses nothing and the next one finishes the job", async () => {
    const { sub, id } = await account();
    const a = new Device(sub);
    a.solve("k", T + 1);
    const real = a.api.push; a.api.push = async () => { throw new Error("network down"); };
    await expect(syncProgress(a, id)).rejects.toThrow("network down");
    expect(a.ids()).toEqual(["k"]);
    a.api.push = real;
    expect(await syncProgress(a, id)).toMatchObject({ pushed: 1 });
  });

  it("another account cannot receive this device's saved attempts or profile", async () => {
    const one = await account(), two = await account();
    const d = new Device(one.sub); d.solve("p", T + 1); await syncProgress(d, one.id);
    d.prof = { name: "First account" }; await syncProfile(d, one.id);
    d.api = apiFor(two.sub);
    await expect(syncProgress(d, two.id)).rejects.toThrow(SyncAccountError);
    await expect(syncProfile(d, two.id)).rejects.toThrow(SyncAccountError);
    expect(d.st!.userId).toBe(one.id);
    expect(d.ids()).toEqual(["p"]);
    expect((await d.api.pull(0)).attempts).toEqual([]);
    expect(await d.api.getProfile()).toBeNull();
    d.api = apiFor(one.sub);
    expect(await syncProgress(d, one.id)).toEqual({ pulled: 0, pushed: 0 });
    await syncProfile(d, one.id);
    expect(d.prof).toEqual({ name: "First account" });
  });

  it("profiles merge field by field between devices", async () => {
    const { sub, id } = await account();
    const a = new Device(sub), b = new Device(sub);
    a.prof = { name: "Jo", dailyGoal: 12 };
    await syncProfile(a, id); await syncProfile(b, id);
    expect(b.prof).toEqual({ name: "Jo", dailyGoal: 12 });
    a.prof = { name: "Jo", dailyGoal: 20 }; b.prof = { name: "Joanna", dailyGoal: 12 };
    await syncProfile(a, id); await syncProfile(b, id); await syncProfile(a, id);
    expect(a.prof).toEqual({ name: "Joanna", dailyGoal: 20 });
    expect(b.prof).toEqual(a.prof);
    const before = calls; await syncProfile(a, id);
    expect(calls - before).toBe(1); // one read, no write
    const blank = new Device(sub); await syncProfile(blank, id);
    expect(blank.prof).toEqual(a.prof);
  });
});

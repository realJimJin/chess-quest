import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncProfile, syncProgress, freshState, type Api } from "./engine";
import { browserSyncIo, SYNC_STATE_KEY } from "./storage";
import { SyncAccountError, SyncProblem, SyncStorageError } from "./errors";
import { LocalProgressStore, PROGRESS_KEY, RESET_KEY, writeProgress } from "../progress";
import { readStoredProfile } from "../profile";
import type { Attempt } from "../types";

const attempt: Attempt = { exerciseId: "first-account-attempt", ts: 1000, mode: "flow", result: "solved", timeMs: 100, wrongMoves: [], offBookMoves: [], hintLevel: 0, finished: true };
const stale = { version: 1 as const, attempts: [attempt], srs: {} };
const PROFILE_KEY = "cst.profile.v1";
let values: Map<string, string>;
let failWrite: string | undefined;
beforeEach(() => {
  values = new Map(); failWrite = undefined;
  vi.spyOn(Date, "now").mockReturnValue(10_000);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { if (k === failWrite) throw new Error("QuotaExceededError"); values.set(k, v); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const api = (): Api => ({
  pull: vi.fn(async () => ({ attempts: [], cursor: 0, more: false, resetAt: 0 })),
  push: vi.fn(async b => ({ cursor: 1, resetAt: b.resetAt ?? 0, stored: b.attempts.length })),
  getProfile: vi.fn(async () => null),
  putProfile: vi.fn(async data => ({ ok: true, profile: { data, version: 1 } })),
});

describe("browser sync safety", () => {
  it("preserves saved work and refuses both kinds of sync for another account", async () => {
    const service = api(), io = browserSyncIo(service);
    writeProgress(stale);
    values.set(PROFILE_KEY, JSON.stringify({ name: "First" }));
    io.setState(freshState("account-a"));
    const before = new Map(values);
    await expect(syncProgress(io, "account-b")).rejects.toThrow(SyncAccountError);
    await expect(syncProfile(io, "account-b")).rejects.toThrow(SyncAccountError);
    for (const call of Object.values(service)) expect(call).not.toHaveBeenCalled();
    expect(values).toEqual(before);
  });

  it("binds ownership before a failed first request, including profile-first sync", async () => {
    for (const sync of [syncProgress, syncProfile]) {
      values.clear();
      const service = api(), io = browserSyncIo(service);
      service.pull = vi.fn().mockRejectedValue(new Error("offline"));
      service.getProfile = vi.fn().mockRejectedValue(new Error("offline"));
      await expect(sync(io, "account-a")).rejects.toThrow("offline");
      expect(io.state()?.userId).toBe("account-a");
      await expect(sync(io, "account-b")).rejects.toThrow(SyncAccountError);
    }
  });

  it("makes no requests if ownership cannot be saved", async () => {
    failWrite = SYNC_STATE_KEY;
    const service = api(), io = browserSyncIo(service);
    await expect(syncProgress(io, "account-a")).rejects.toThrow(SyncStorageError);
    await expect(syncProfile(io, "account-a")).rejects.toThrow(SyncStorageError);
    for (const call of Object.values(service)) expect(call).not.toHaveBeenCalled();
  });

  it.each(["{broken", "null", "{}", JSON.stringify({ ...freshState("account-a"), cursor: -1 })])("preserves unreadable ownership and stops sync: %s", async raw => {
    values.set(SYNC_STATE_KEY, raw);
    const service = api(), io = browserSyncIo(service);
    await expect(syncProgress(io, "account-b")).rejects.toThrow(SyncStorageError);
    await expect(syncProfile(io, "account-b")).rejects.toThrow(SyncStorageError);
    for (const call of Object.values(service)) expect(call).not.toHaveBeenCalled();
    expect(values.get(SYNC_STATE_KEY)).toBe(raw);
  });

  it("does not apply an in-flight response if stored ownership changed", async () => {
    const service = api(), io = browserSyncIo(service);
    service.pull = vi.fn(async () => {
      io.setState(freshState("account-b"));
      return { attempts: [attempt], cursor: 1, more: false, resetAt: 0 };
    });
    await expect(syncProgress(io, "account-a")).rejects.toThrow(SyncAccountError);
    expect(values.has(PROGRESS_KEY)).toBe(false);
    expect(service.push).not.toHaveBeenCalled();
    expect(io.state()?.userId).toBe("account-b");
  });

  it("keeps reset protection after acknowledgement while allowing later attempts", async () => {
    const service = api(), io = browserSyncIo(service), store = new LocalProgressStore();
    await store.save(stale); await store.reset();
    await syncProgress(io, "account-a");
    expect(values.get(RESET_KEY)).toBe("10000");
    await store.save(stale);
    expect((await store.load()).attempts).toEqual([]);
    const next = { ...attempt, exerciseId: "after-reset", ts: 10_001 };
    await store.save({ ...stale, attempts: [attempt, next] });
    expect((await store.load()).attempts).toEqual([next]);
    service.pull = vi.fn(async () => ({ attempts: [next], cursor: 2, more: false, resetAt: 10_000 }));
    vi.mocked(service.push).mockClear();
    await syncProgress(io, "account-a");
    expect(service.push).not.toHaveBeenCalled();
  });

  it("persists a reset from another device so stale screens cannot resurrect it", async () => {
    const service = api(), io = browserSyncIo(service), store = new LocalProgressStore();
    await store.save(stale);
    service.pull = vi.fn(async () => ({ attempts: [], cursor: 7, more: false, resetAt: 5000 }));
    await syncProgress(io, "account-a");
    await store.save(stale);
    expect((await store.load()).attempts).toEqual([]);
    expect(values.get(RESET_KEY)).toBe("5000");
    expect(io.state()?.cursor).toBe(7);
    expect(service.push).not.toHaveBeenCalled();
  });

  it("an older acknowledgement cannot erase a reset made during a push", async () => {
    const service = api(), io = browserSyncIo(service), store = new LocalProgressStore();
    await store.reset();
    service.push = vi.fn(async () => {
      vi.mocked(Date.now).mockReturnValue(20_000);
      await store.reset();
      return { cursor: 1, resetAt: 10_000, stored: 0 };
    });
    await syncProgress(io, "account-a");
    expect(values.get(RESET_KEY)).toBe("20000");
    // The next sync still sends the more recent reset.
    service.pull = vi.fn(async () => ({ attempts: [], cursor: 1, more: false, resetAt: 10_000 }));
    service.push = vi.fn(async b => ({ cursor: 2, resetAt: b.resetAt ?? 0, stored: 0 }));
    await syncProgress(io, "account-a");
    expect(service.push).toHaveBeenCalledWith({ attempts: [], resetAt: 20_000 });
  });

  it("a backwards clock cannot lower the local reset barrier", async () => {
    values.set(RESET_KEY, "20000");
    await new LocalProgressStore().reset();
    expect(values.get(RESET_KEY)).toBe("20000");
  });

  it.each([PROGRESS_KEY, RESET_KEY])("does not advance the cursor when applying cloud progress fails at %s", async key => {
    const service = api(), io = browserSyncIo(service);
    io.setState(freshState("account-a"));
    failWrite = key;
    service.pull = vi.fn(async () => ({ attempts: [attempt], cursor: 5, more: false, resetAt: key === RESET_KEY ? 500 : 0 }));
    await expect(syncProgress(io, "account-a")).rejects.toThrow(SyncStorageError);
    expect(io.state()?.cursor).toBe(0);
    expect(service.push).not.toHaveBeenCalled();
    failWrite = undefined;
    await syncProgress(io, "account-a");
    expect(io.attempts()).toEqual([attempt]);
    expect(io.state()?.cursor).toBe(5);
  });

  it("does not overwrite a newer cloud profile when saving it locally fails; retry recovers", async () => {
    const service = api(), io = browserSyncIo(service);
    values.set(PROFILE_KEY, JSON.stringify({ name: "Old" }));
    io.setState({ ...freshState("account-a"), profileVersion: 1, profileBase: { name: "Old" } });
    service.getProfile = vi.fn(async () => ({ data: { name: "New" }, version: 2 }));
    failWrite = PROFILE_KEY;
    await expect(syncProfile(io, "account-a")).rejects.toThrow(SyncStorageError);
    expect(service.putProfile).not.toHaveBeenCalled();
    expect(io.state()?.profileVersion).toBe(1);
    expect(readStoredProfile()).toEqual({ name: "Old" });
    failWrite = undefined;
    await syncProfile(io, "account-a");
    expect(io.state()?.profileVersion).toBe(2);
    expect(readStoredProfile()).toEqual({ name: "New" });
    expect(service.putProfile).not.toHaveBeenCalled();
  });

  it.each([PROFILE_KEY, PROGRESS_KEY, RESET_KEY])("preserves corrupt saved data and stops writes: %s", async key => {
    const service = api(), io = browserSyncIo(service);
    values.set(key, "corrupt");
    const sync = key === PROFILE_KEY ? syncProfile : syncProgress;
    await expect(sync(io, "account-a")).rejects.toThrow(SyncStorageError);
    expect(service.push).not.toHaveBeenCalled();
    expect(service.putProfile).not.toHaveBeenCalled();
    expect(values.get(key)).toBe("corrupt");
  });

  it("reports repeated profile conflicts instead of claiming sync succeeded", async () => {
    const service = api(), io = browserSyncIo(service);
    values.set(PROFILE_KEY, JSON.stringify({ name: "Local" }));
    service.putProfile = vi.fn(async () => ({ ok: false, profile: null }));
    await expect(syncProfile(io, "account-a")).rejects.toThrow(SyncProblem);
    expect(service.putProfile).toHaveBeenCalledTimes(4);
  });
});

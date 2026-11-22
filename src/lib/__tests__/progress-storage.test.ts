import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalProgressStore, emptyProgress, recordAttempt } from "../progress";
import type { Attempt } from "../types";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const attempt = (id: string, ts = Date.now() - 1000): Attempt => ({ exerciseId: id, ts, mode: "flow", result: "failed", timeMs: 1000, wrongMoves: [], offBookMoves: [], hintLevel: 0 });
beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));

describe("merged progress persistence", () => {
  it("retains both attempts when a stale tab saves its copy", async () => {
    const store = new LocalProgressStore();
    await store.save(recordAttempt(emptyProgress(), attempt("first")));
    await store.save(recordAttempt(emptyProgress(), attempt("second")));
    expect((await store.load()).attempts.map(a => a.exerciseId)).toEqual(["first", "second"]);
  });
  it("does not resurrect cleared attempts when a stale tab saves after reset", async () => {
    const store = new LocalProgressStore();
    const stale = recordAttempt(emptyProgress(), attempt("old"));
    await store.save(stale);
    await store.reset();
    await store.save(stale);
    expect(await store.load()).toEqual(emptyProgress());
  });
  it("keeps a new attempt after reset while dropping old attempts from the same stale save", async () => {
    const store = new LocalProgressStore();
    const stale = recordAttempt(emptyProgress(), attempt("old"));
    await store.save(stale); await store.reset();
    await store.save(recordAttempt(stale, attempt("new", Date.now() + 10)));
    expect((await store.load()).attempts.map(a => a.exerciseId)).toEqual(["new"]);
    expect(Object.keys((await store.load()).srs)).toEqual(["new"]);
  });
  it("repeated reflection edits retain all changes on reload", async () => {
    const store = new LocalProgressStore();
    await store.save(recordAttempt(emptyProgress(), attempt("puzzle")));
    store.update(state => ({ ...state, attempts: state.attempts.map(a => ({ ...a, selfReport: ["calculation"] })) }));
    store.update(state => ({ ...state, attempts: state.attempts.map(a => ({ ...a, selfReport: ["calculation", "visualization"] })) }));
    expect((await store.load()).attempts[0].selfReport).toEqual(["calculation", "visualization"]);
  });
  it("keeps reset markers scoped to their progress store", async () => {
    const first = new LocalProgressStore("first"), second = new LocalProgressStore("second");
    const data = recordAttempt(emptyProgress(), attempt("second-user"));
    await second.save(data); await first.reset(); await second.save(data);
    expect((await second.load()).attempts).toHaveLength(1);
  });
});

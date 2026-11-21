// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { deserialize, serialize } from "node:v8";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import { AppProvider, useApp } from "../../../lib/store";
import { loadLibrary, saveLibrary } from "../../../lib/library";
import { SAMPLE_PACK } from "../../../lib/samples";
import { emptyProgress, PROGRESS_KEY, readProgress, writeProgress } from "../../../lib/progress";
import { notifyCloudApplied } from "../../../lib/cloud/events";
import { DEFAULT_PROFILE, saveProfile } from "../../../lib/profile";
import type { Attempt } from "../../../lib/types";
import LibraryExperience from "../../LibraryExperience";
import TrainingPlan from "../TrainingPlan";
import TrainPage from "../../../app/train/page";
import Shell from "../../Shell";

const navigation = vi.hoisted(() => ({ query: new URLSearchParams(), pathname: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useSearchParams: () => navigation.query, useRouter: () => ({ push: navigation.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a> }));
// DOM tests exercise the real trainer and storage. Chessground rendering and
// pointer geometry remain a separate real-browser/device verification gate.
vi.mock("../../Board", () => ({ default: ({ fen, interactive }: { fen: string; interactive: boolean }) => <div data-testid="board" data-fen={fen} data-interactive={interactive} /> }));

let app: ReturnType<typeof useApp>;
function Observe() {
  const state = useApp();
  useEffect(() => { app = state; }, [state]);
  return state.progressError ? <p role="alert">{state.progressError}</p> : null;
}
const mount = async (child: ReactNode) => {
  const view = render(<AppProvider><Observe />{child}</AppProvider>);
  await waitFor(() => expect(app.ready).toBe(true));
  return view;
};
const setRoute = (params: Record<string, string>) => { navigation.query = new URLSearchParams(params); };
const seedSamples = () => saveLibrary({ samples: { book: SAMPLE_PACK.book, exercises: SAMPLE_PACK.exercises, importedAt: 1 } });
const failedAttempt = (): Attempt => ({ exerciseId: SAMPLE_PACK.exercises[0].id, ts: Date.now() - 1000, mode: "flow", result: "failed", timeMs: 4000, wrongMoves: [], offBookMoves: [], hintLevel: 0 });

beforeEach(async () => {
  vi.stubGlobal("structuredClone", <T,>(value: T): T => deserialize(serialize(value)));
  // Vitest preserves Node 25's native localStorage global unless explicitly
  // replaced. Use this environment's actual DOM Storage implementation.
  vi.stubGlobal("localStorage", (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage);
  localStorage.clear();
  localStorage.setItem("cst.auto", "0");
  await saveLibrary({});
  navigation.query = new URLSearchParams(); navigation.pathname = "/"; navigation.push.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("redesign and core integration", () => {
  it.each([
    ["/", "library", "Library"],
    ["/library", "library", "Library"],
    ["/library/", "library", "Library"],
    ["/train/", "study", "Training"],
    ["/world/", "study", "Journey"],
  ])("keeps the correct theme and navigation on %s", async (pathname, surface, current) => {
    navigation.pathname = pathname;
    const view = render(<Shell><Observe /><LibraryExperience /></Shell>);
    await waitFor(() => expect(app.ready).toBe(true));
    expect(view.container.querySelector(".app-shell")?.getAttribute("data-surface")).toBe(surface);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe(current);
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
  it("shows original content without writing the library, then imports it on an explicit study action", async () => {
    await mount(<LibraryExperience />);
    expect(await loadLibrary()).toEqual({});
    await userEvent.click(screen.getByRole("button", { name: "Start studying" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/train?book=samples&mode=flow"));
    expect((await loadLibrary()).samples.exercises).toHaveLength(8);
    expect(readProgress().attempts).toHaveLength(0);
  });
  it("solves through typed moves, persists once, and reports the actual session result", async () => {
    await seedSamples(); setRoute({ id: "samples-0001", mode: "flow" });
    await mount(<TrainPage />);
    await userEvent.type(await screen.findByTestId("move-notation"), "Rd8#");
    await userEvent.click(screen.getByRole("button", { name: "Play move" }));
    await screen.findByText("Nicely calculated.");
    expect(readProgress().attempts).toHaveLength(1);
    expect(readProgress().attempts[0]).toMatchObject({ exerciseId: "samples-0001", result: "solved", finished: true });
    await userEvent.click(screen.getByTestId("next"));
    expect(await screen.findByText("You worked through 1 exercise. Take a moment to consider what you noticed.")).toBeTruthy();
  });
  it("locks calculation, preserves written analysis, and commits through the existing chess grader", async () => {
    await seedSamples(); setRoute({ id: "samples-0001", mode: "deep" });
    await mount(<TrainPage />);
    expect((await screen.findByTestId("board")).getAttribute("data-interactive")).toBe("false");
    await userEvent.click(screen.getByTestId("deep-start"));
    await userEvent.type(screen.getByTestId("deep-candidates"), "Rd8");
    await userEvent.type(screen.getByTestId("deep-lines"), "1.Rd8#");
    await userEvent.selectOptions(screen.getByTestId("deep-eval"), "winning");
    await userEvent.type(screen.getByTestId("deep-answer"), "Rd8#");
    await userEvent.click(screen.getByTestId("deep-candidates"));
    await userEvent.keyboard("{Enter}");
    expect(readProgress().attempts).toHaveLength(0);
    await userEvent.click(screen.getByTestId("deep-commit"));
    await screen.findByText("Nicely calculated.");
    expect(readProgress().attempts[0]).toMatchObject({ mode: "deep", result: "solved", deep: { candidates: "Rd8", lines: "1.Rd8#", evaluation: "winning", finalAnswer: "Rd8#" } });
  });
  it("retains consecutive reflection edits and does not skip an exercise when Enter activates a tag", async () => {
    await seedSamples(); setRoute({ id: "samples-0001", mode: "flow" });
    await mount(<TrainPage />);
    await userEvent.click(await screen.findByTestId("giveup"));
    const first = screen.getByTestId("tag-calculation"); first.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByTestId("tag-visualization"));
    expect(screen.getByTestId("result")).toBeTruthy();
    expect(readProgress().attempts[0].selfReport).toEqual(["calculation", "visualization"]);
  });
  it("rejects illegal typed moves without an attempt and records a hinted solve as assisted", async () => {
    await seedSamples(); setRoute({ id: "samples-0001", mode: "flow" });
    await mount(<TrainPage />);
    await userEvent.type(await screen.findByTestId("move-notation"), "Rd9");
    await userEvent.click(screen.getByRole("button", { name: "Play move" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(readProgress().attempts).toHaveLength(0);
    await userEvent.clear(screen.getByTestId("move-notation"));
    await userEvent.click(screen.getByTestId("hint"));
    await userEvent.type(screen.getByTestId("move-notation"), "Rd8#");
    await userEvent.click(screen.getByRole("button", { name: "Play move" }));
    await screen.findByText("You found the way.");
    expect(readProgress().attempts[0]).toMatchObject({ result: "assisted", hintLevel: 1 });
  });
  it("reset uses the explicit storage reset and remains empty after remount", async () => {
    await mount(null);
    act(() => app.addAttempt(failedAttempt()));
    await waitFor(() => expect(app.progress.attempts).toHaveLength(1));
    act(() => app.resetProgress());
    await waitFor(() => expect(app.progress.attempts).toHaveLength(0));
    expect(readProgress()).toEqual(emptyProgress());
    cleanup(); await mount(null);
    expect(app.progress).toEqual(emptyProgress());
  });
  it("refreshes the UI when the core announces applied progress", async () => {
    await mount(null);
    act(() => {
      writeProgress({ version: 1, attempts: [failedAttempt()], srs: {} });
      notifyCloudApplied("progress");
    });
    await waitFor(() => expect(app.progress.attempts).toHaveLength(1));
    expect(app.progress.srs["samples-0001"]).toBeTruthy();
  });
  it("preserves progress when writing the reset marker fails", async () => {
    await mount(null);
    act(() => app.addAttempt(failedAttempt()));
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "cst.progress.reset") throw new DOMException("Storage full", "QuotaExceededError");
      realSet.call(this, key, value);
    });
    act(() => app.resetProgress());
    await screen.findByRole("alert");
    expect(readProgress().attempts).toHaveLength(1);
    expect(app.progress.attempts).toHaveLength(1);
    expect(app.canRetryProgressSave).toBe(false);
  });
  it("refreshes progress from another tab's storage event", async () => {
    await mount(null);
    act(() => {
      writeProgress({ version: 1, attempts: [failedAttempt()], srs: {} });
      window.dispatchEvent(new StorageEvent("storage", { key: PROGRESS_KEY, storageArea: localStorage }));
    });
    await waitFor(() => expect(app.progress.attempts).toHaveLength(1));
  });
  it("keeps failed saves in this session and retries without losing or duplicating attempts", async () => {
    await mount(null);
    const realSet = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === PROGRESS_KEY) throw new DOMException("Storage full", "QuotaExceededError");
      realSet.call(this, key, value);
    });
    act(() => app.addAttempt(failedAttempt()));
    await screen.findByRole("alert");
    expect(app.progress.attempts).toHaveLength(1);
    expect(readProgress().attempts).toHaveLength(0);
    const first = app.progress.attempts[0];
    act(() => app.amendAttempt(first.exerciseId, first.ts, { selfReport: ["calculation"] }));
    act(() => app.addAttempt({ ...failedAttempt(), exerciseId: "samples-0002" }));
    expect(app.progress.attempts).toHaveLength(2);
    failure.mockRestore();
    act(() => app.retryProgressSave());
    await waitFor(() => expect(app.progressError).toBeNull());
    expect(readProgress().attempts).toHaveLength(2);
    expect(readProgress().attempts.find(a => a.exerciseId === first.exerciseId)?.selfReport).toEqual(["calculation"]);
    act(() => app.retryProgressSave());
    expect(readProgress().attempts).toHaveLength(2);
  });
  it("connects Claude's recommendation to an exact playable session", async () => {
    saveProfile({ ...DEFAULT_PROFILE, allocation: [{ key: "calculation", label: "Calculation", weight: 100 }], dailyGoal: 2 });
    await mount(<TrainingPlan />);
    await userEvent.click((await screen.findAllByRole("button", { name: "Begin session" }))[0]);
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    const href = navigation.push.mock.calls[0][0] as string;
    const url = new URL(href, "https://example.test");
    const ids = JSON.parse(url.searchParams.get("ids")!) as string[];
    expect(ids.length).toBeGreaterThan(0); expect(ids.length).toBeLessThanOrEqual(2);
    expect((await loadLibrary()).samples).toBeTruthy();
    cleanup(); navigation.query = url.searchParams;
    await mount(<TrainPage />);
    expect(await screen.findByText(`Position 1 of ${ids.length}`)).toBeTruthy();
    expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(SAMPLE_PACK.exercises.find(ex => ex.id === ids[0])!.fen);
  });
  it("changes the fixed queue when navigating to a different map level", async () => {
    const exercises = SAMPLE_PACK.exercises.map((ex, index) => ({ ...ex, chapter: { id: index < 4 ? "first" : "second", title: index < 4 ? "First" : "Second" } }));
    await saveLibrary({ samples: { book: SAMPLE_PACK.book, exercises, importedAt: 1 } });
    setRoute({ level: "samples:first:1", mode: "flow" });
    const view = await mount(<TrainPage />);
    expect((await screen.findByTestId("board")).getAttribute("data-fen")).toBe(exercises[0].fen);
    setRoute({ level: "samples:second:1", mode: "flow" });
    view.rerender(<AppProvider><Observe /><TrainPage /></AppProvider>);
    await waitFor(() => expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(exercises[4].fen));
  });
});

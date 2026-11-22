// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import OpeningTrainer from "./OpeningTrainer";
import { OPENING_LINES } from "@/lib/openings/catalog";
import { compileLine } from "@/lib/openings/trainer";
import { emptyOpeningProgress, type OpeningProgress } from "@/lib/openings/progress";
import type { MoveInput } from "@/lib/puzzle";

vi.mock("../Board", () => ({ default: ({ fen, orientation, interactive, onMove }: { fen: string; orientation: string; interactive: boolean; onMove: (m: MoveInput) => void }) => <div data-testid="board" data-fen={fen} data-orientation={orientation}>{interactive && new Chess(fen).moves({ verbose: true }).map(m => <button key={m.lan} onClick={() => onMove(m)}>{`Board ${m.san}`}</button>)}</div> }));
afterEach(cleanup);
beforeEach(() => { window.scrollTo = vi.fn(); });
function memoryStore() {
  let value: OpeningProgress = emptyOpeningProgress();
  return { load: vi.fn(() => value), save: vi.fn((next: OpeningProgress) => { value = next; }) };
}
async function playLine(index: number) {
  const line = OPENING_LINES[index];
  for (const step of compileLine(line).filter(s => s.side === line.side)) {
    await waitFor(() => expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(step.fen));
    await userEvent.click(screen.getByRole("button", { name: `Board ${step.san}` }));
  }
  await screen.findByText(/recalled without help/);
}

describe("phone opening trainer", () => {
  it("starts Black from the correct perspective, replies automatically, and saves a completed drill", async () => {
    const store = memoryStore();
    render(<OpeningTrainer progressStore={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Play as Black" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Practice" })[0]);
    expect(screen.getByTestId("board").getAttribute("data-orientation")).toBe("black");
    await screen.findByText("Your move as black");
    expect(screen.queryByText("Play c6")).toBeNull();
    await playLine(3);
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    expect(store.load().lines[OPENING_LINES[3].id].accuracy).toBe(100);
    await userEvent.click(screen.getByRole("button", { name: "All openings" }));
    expect(screen.getByText("100% last recall")).toBeTruthy();
  }, 20000);
  it("grades hints and retries honestly, lets users review mistakes, and retries failed saves", async () => {
    const store = memoryStore();
    const save = store.save;
    save.mockImplementationOnce(() => { throw new Error("Storage full"); });
    const view = render(<OpeningTrainer progressStore={store} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Practice" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Board e4" }));
    expect(screen.getByText(/e4 is legal/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reveal move" }));
    expect(screen.getByText("Play d4")).toBeTruthy();
    await playLine(0);
    expect(screen.getByRole("alert").textContent).toContain("could not be saved");
    await userEvent.click(screen.getByRole("button", { name: "Retry saving progress" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(store.load().lines[OPENING_LINES[0].id].accuracy).toBe(92);
    await userEvent.click(screen.getByRole("button", { name: "1. d4" }));
    expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(new Chess().fen());
    view.unmount();
    render(<OpeningTrainer progressStore={store} />);
    expect(await screen.findByText("92% last recall")).toBeTruthy();
  }, 20000);
  it("keeps learning ungraded and cancels a pending opponent reply when switching lines", async () => {
    const store = memoryStore();
    render(<OpeningTrainer progressStore={store} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Learn line" })[0]);
    expect(screen.getByText("Play d4")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Show on board" }));
    await userEvent.click(screen.getByRole("button", { name: "← Openings" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Practice" })[1]);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(new Chess().fen());
    expect(store.save).not.toHaveBeenCalled();
  });
  it("keeps existing saved data untouched when loading fails", async () => {
    const store = { load: () => { throw new Error("bad data"); }, save: vi.fn() };
    render(<OpeningTrainer progressStore={store} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Practice" })[0]);
    expect(store.save).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { OPENING_LINES } from "./catalog";
import { advanceOpponent, attemptOpeningMove, compileLine, isYourTurn, newSession, positionAt, sessionScore, revealOpeningMove } from "./trainer";
import { emptyOpeningProgress, parseOpeningProgress, recordOpeningRun } from "./progress";

describe("recorded opening lines", () => {
  it.each(OPENING_LINES)("replays every move of $title legally and trains the recorded side", line => {
    const steps = compileLine(line);
    expect(steps.length).toBeGreaterThanOrEqual(14);
    expect(steps[0].fen).toBe(DEFAULT_POSITION);
    expect(new Chess(positionAt(steps, steps.length)).history()).toEqual([]);
    let session = newSession("recall");
    for (const step of steps) {
      session = isYourTurn(steps, line.side, session) ? attemptOpeningMove(steps, line.side, session, step) : advanceOpponent(steps, line.side, session);
    }
    expect(session.ply).toBe(steps.length);
    expect(sessionScore(steps, line.side, session).accuracy).toBe(100);
    const saved = recordOpeningRun(emptyOpeningProgress(), line, steps, session, 1000);
    expect(saved.lines[line.id].runs).toBe(1);
    expect(saved.lines[line.id].reviewAt).toBe(86401000);
  });
  it("does not accept a legal alternative as the recorded move or advance after an illegal move", () => {
    const line = OPENING_LINES[0], steps = compileLine(line);
    const alternative = attemptOpeningMove(steps, line.side, newSession("recall"), { from: "e2", to: "e4" });
    expect(alternative.feedback).toContain("is legal");
    expect(alternative.ply).toBe(0);
    expect(alternative.mistakes).toEqual([0]);
    expect(positionAt(steps, alternative.ply)).toBe(DEFAULT_POSITION);
    const illegal = attemptOpeningMove(steps, line.side, alternative, { from: "e2", to: "e5" });
    expect(illegal.feedback).toContain("not legal");
    expect(illegal.resetKey).toBe(2);
    expect(illegal.mistakes).toEqual([0]);
  });
  it("ignores duplicate input while the opponent is moving and only advances one reply", () => {
    const line = OPENING_LINES[0], steps = compileLine(line);
    const played = attemptOpeningMove(steps, line.side, newSession("recall"), steps[0]);
    expect(attemptOpeningMove(steps, line.side, played, steps[1])).toBe(played);
    const reply = advanceOpponent(steps, line.side, played);
    expect(reply.ply).toBe(2);
    expect(advanceOpponent(steps, line.side, reply)).toBe(reply);
  });
  it("counts assistance once, retains other lines, and schedules an imperfect run for review", () => {
    const line = OPENING_LINES[0], steps = compileLine(line);
    let session = revealOpeningMove(revealOpeningMove(newSession("recall")));
    session = { ...session, mistakes: [0, 2], ply: steps.length };
    const score = sessionScore(steps, line.side, session);
    expect(score.correct).toBe(score.total - 2);
    const initial = emptyOpeningProgress();
    const saved = recordOpeningRun(initial, line, steps, session, 2000);
    expect(saved.lines[line.id].mistakePlies).toEqual([0, 2]);
    expect(saved.lines[line.id].reviewAt).toBe(2000);
    expect(parseOpeningProgress(JSON.stringify(saved))).toEqual(saved);
    expect(recordOpeningRun(saved, line, steps, newSession("recall"), 3000)).toBe(saved);
    expect(recordOpeningRun(saved, line, steps, { ...session, mode: "learn" }, 3000)).toBe(saved);
  });
  it("does not silently overwrite corrupted or future-format progress", () => {
    expect(() => parseOpeningProgress('{"version":2,"lines":{}}')).toThrow();
    expect(() => parseOpeningProgress('{"version":1,"lines":{"bad":null}}')).toThrow();
    expect(() => parseOpeningProgress("garbage")).toThrow();
    expect(parseOpeningProgress(null)).toEqual(emptyOpeningProgress());
  });
});

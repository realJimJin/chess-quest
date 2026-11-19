import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { createPuzzle, formatSolution, legalDests, needsPromotion, parseSolutionText, tryMove } from "../puzzle";
import { exerciseErrors, isTrainable, SCHEMA, validateDb } from "../validate";
import { classifyAlternative } from "../engine";
import { computeStats, DAY, dueReviews, emptyProgress, nextSrs, recordAttempt, streak } from "../progress";
import { diagnose, replayLine } from "../diagnostics";
import { buildHints } from "../hints";
import { mergeBook } from "../library";
import { decodeSession, encodeSession } from "../share";
import type { Attempt } from "../types";
import { BACK_RANK, fx, LADDER, SMOTHER } from "./fixtures";

const att = (o: Partial<Attempt>): Attempt => ({ exerciseId: "t1", ts: 0, mode: "flow", result: "solved", timeMs: 1000, wrongMoves: [], offBookMoves: [], hintLevel: 0, ...o });

describe("puzzle completion and multi-move sequences", () => {
  it("plays a multi-move line with automatic replies to completion", () => {
    const ex = fx("t2", SMOTHER, "1.Qg8+ Rxg8 2.Nf7#");
    let p = createPuzzle(ex.fen, ex.solution);
    const a = tryMove(p, { from: "b3", to: "g8" });
    expect(a.kind).toBe("book");
    if (a.kind !== "book") return;
    expect(a.reply?.san).toBe("Rxg8");
    expect(a.puzzle.done).toBe(false);
    p = a.puzzle;
    const b = tryMove(p, { from: "h6", to: "f7" });
    expect(b.kind === "book" && b.puzzle.done).toBe(true);
    expect(new Chess((b as { puzzle: { fen: string } }).puzzle.fen).isCheckmate()).toBe(true);
  });
  it("rejects illegal moves without consuming the puzzle", () => {
    const ex = fx("t1", BACK_RANK, "1.Rd8#");
    expect(tryMove(createPuzzle(ex.fen, ex.solution), { from: "d1", to: "e2" }).kind).toBe("illegal");
  });
  it("accepts a different checkmate as correct (alternate solution)", () => {
    // book says Rb8#, but Ra8 is also mate
    const ex = fx("t3", "7k/8/6K1/8/8/8/R7/1R6 w - - 0 1", "1.Rb8#");
    const r = tryMove(createPuzzle(ex.fen, ex.solution), { from: "a2", to: "a8" });
    expect(r.kind).toBe("mate");
  });
  it("returns a legal non-book move as off-book, never as wrong", () => {
    const ex = fx("t4", LADDER, "1.Rb7 Kh8 (1...Kf8 2.Ra8#) 2.Ra8#");
    const r = tryMove(createPuzzle(ex.fen, ex.solution), { from: "a6", to: "a7" });
    expect(r.kind).toBe("offbook");
    expect(r.kind === "offbook" && r.san).toBe("Ra7");
  });
  it("follows the main defence and keeps variations in the tree", () => {
    const ex = fx("t4", LADDER, "1.Rb7 Kh8 (1...Kf8 2.Ra8#) 2.Ra8#");
    expect(ex.solution[0].children.map((c) => c.san)).toEqual(["Kh8", "Kf8"]);
    expect(formatSolution(ex.fen, ex.solution)).toBe("1.Rb7 Kh8 (1...Kf8 2.Ra8#) 2.Ra8#");
  });
  it("handles Black-to-move numbering", () => {
    const fen = "3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1";
    expect(formatSolution(fen, parseSolutionText(fen, "1...Rd1#"))).toBe("1...Rd1#");
  });
});

describe("promotion and special moves", () => {
  it("promotion: requires the right piece, underpromotion is distinct", () => {
    const fen = "3r3k/4P1pp/8/8/8/8/8/K7 w - - 0 1";
    const ex = fx("t5", fen, "1.exd8=Q#");
    expect(needsPromotion(fen, "e7", "d8")).toBe(true);
    expect(needsPromotion(fen, "a1", "a2")).toBe(false);
    const p = createPuzzle(ex.fen, ex.solution);
    expect(tryMove(p, { from: "e7", to: "d8", promotion: "q" }).kind).toBe("book");
    expect(tryMove(p, { from: "e7", to: "d8", promotion: "r" }).kind).toBe("mate"); // also mate: accepted
    expect(tryMove(p, { from: "e7", to: "d8", promotion: "n" }).kind).toBe("offbook");
  });
  it("castling both sides", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    const sol = parseSolutionText(fen, "1.0-0-0 0-0");
    expect(sol[0].uci).toBe("e1c1");
    const r = tryMove(createPuzzle(fen, sol), { from: "e1", to: "c1" });
    expect(r.kind).toBe("book");
    if (r.kind === "book") { expect(r.reply?.uci).toBe("e8g8"); expect(r.puzzle.fen.startsWith("r4rk1/8/8/8/8/8/8/2KR3R")).toBe(true); }
    expect(legalDests(fen).get("e1")).toContain("g1");
  });
  it("en passant removes the captured pawn", () => {
    const fen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
    const sol = parseSolutionText(fen, "1.exd6");
    const r = tryMove(createPuzzle(fen, sol), { from: "e5", to: "d6" });
    expect(r.kind === "book" && r.puzzle.fen.startsWith("4k3/8/3P4/8/8")).toBe(true);
  });
});

describe("FEN and solution validation on import", () => {
  const good = fx("t1", BACK_RANK, "1.Rd8#");
  it("accepts a valid database", () => {
    const r = validateDb({ schema: SCHEMA, book: { id: "test", title: "T", author: "", edition: "" }, generatedAt: "", exercises: [good] });
    expect(r.error).toBeUndefined(); expect(r.accepted).toHaveLength(1); expect(isTrainable(r.accepted[0])).toBe(true);
  });
  it("rejects wrong schema / garbage", () => {
    expect(validateDb({ foo: 1 }).error).toMatch(/Not an exercise database/);
    expect(validateDb(null).error).toBeTruthy();
  });
  it("rejects bad FENs, illegal solutions, wrong side and duplicates — and says why", () => {
    const badFen = { ...good, id: "b1", fen: "8/8/8/8/8/8/8/8 w - - 0 1" };
    const illegal = { ...good, id: "b2", solution: [{ san: "Qd8#", uci: "d1h5", children: [] }] };
    const side = { ...good, id: "b3", sideToMove: "black" as const };
    const r = validateDb({ schema: SCHEMA, book: { id: "test", title: "T", author: "", edition: "" }, generatedAt: "", exercises: [good, badFen, illegal, side, good] });
    expect(r.accepted.map((e) => e.id)).toEqual(["t1"]);
    expect(r.rejected.map((x) => x.id)).toEqual(["b1", "b2", "b3", "t1"]);
    expect(r.rejected[1].errors[0]).toMatch(/illegal move/);
    expect(r.rejected[3].errors).toContain("duplicate id");
  });
  it("an exercise with no solution is kept for review but is not trainable", () => {
    const r = validateDb({ schema: SCHEMA, book: { id: "test", title: "T", author: "", edition: "" }, generatedAt: "", exercises: [{ ...good, solution: [] }] });
    expect(r.accepted[0].verification.status).toBe("needs_review");
    expect(isTrainable(r.accepted[0])).toBe(false);
  });
  it("a broken exercise already flagged for review is kept for repair, never trainable", () => {
    const broken = { ...good, id: "r1", fen: "8/8/8/8/8/8/8/K7 w - - 0 1", verification: { ...good.verification, status: "needs_review" as const } };
    const r = validateDb({ schema: SCHEMA, book: { id: "test", title: "T", author: "", edition: "" }, generatedAt: "", exercises: [broken] });
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted[0].verification.flags).toContain("failed_import_validation");
    expect(isTrainable(r.accepted[0])).toBe(false);
  });
  it("a solution matched to the wrong exercise is caught as illegal", () => {
    const swapped = fx("t9", BACK_RANK, fx("x", SMOTHER, "1.Qg8+ Rxg8 2.Nf7#").solution);
    expect(exerciseErrors(swapped).join()).toMatch(/illegal move/);
  });
  it("re-import does not overwrite hand-reviewed exercises", () => {
    const reviewed = { ...good, fen: LADDER, verification: { ...good.verification, reviewedBy: "user" as const } };
    const lib = mergeBook({ test: { book: { id: "test", title: "", author: "", edition: "" }, exercises: [reviewed], importedAt: 0 } }, { id: "test", title: "", author: "", edition: "" }, [good]);
    expect(lib.test.exercises[0].fen).toBe(LADDER);
  });
});

describe("alternate solutions via engine scores", () => {
  it("classifies by score gap, never by mere difference from the book", () => {
    expect(classifyAlternative({ mate: 2 }, { mate: 3 })).toBe("equivalent");
    expect(classifyAlternative({ cp: 550 }, { cp: 500 })).toBe("equivalent");
    expect(classifyAlternative({ mate: 3 }, { cp: 620 })).toBe("winning");
    expect(classifyAlternative({ cp: 400 }, { cp: 20 })).toBe("inferior");
    expect(classifyAlternative({ mate: 2 }, { mate: -1 })).toBe("inferior");
  });
});

describe("progress tracking and spaced repetition", () => {
  it("failed exercises enter the review queue and climb the ladder when solved", () => {
    let s = recordAttempt(emptyProgress(), att({ result: "failed", ts: 0 }));
    expect(dueReviews(s, DAY - 1)).toEqual([]);
    expect(dueReviews(s, DAY)).toEqual(["t1"]);
    s = recordAttempt(s, att({ result: "solved", ts: DAY }));
    expect(s.srs.t1.intervalDays).toBe(3);
    s = recordAttempt(s, att({ result: "failed", ts: 5 * DAY }));
    expect(s.srs.t1).toMatchObject({ intervalDays: 1, lapses: 2 });
  });
  it("a clean first solve never enters the queue", () => {
    expect(nextSrs(undefined, "solved", 0)).toBeUndefined();
    expect(nextSrs(undefined, "assisted", 0)?.intervalDays).toBe(1);
  });
  it("computes accuracy, attempts, time, chapter completion and most-missed", () => {
    const exs = [fx("t1", BACK_RANK, "1.Rd8#"), fx("t2", SMOTHER, "1.Qg8+ Rxg8 2.Nf7#")];
    let s = emptyProgress();
    s = recordAttempt(s, att({ exerciseId: "t1", result: "failed", timeMs: 5000, ts: 1 }));
    s = recordAttempt(s, att({ exerciseId: "t1", result: "solved", timeMs: 3000, ts: 2 }));
    s = recordAttempt(s, att({ exerciseId: "t2", result: "solved", timeMs: 2000, ts: 3, mode: "deep" }));
    const st = computeStats(s, exs, 10);
    expect(st.attempted).toBe(2); expect(st.solved).toBe(2);
    expect(st.firstTryAccuracy).toBe(0.5); expect(st.avgAttempts).toBe(1.5);
    expect(st.totalTimeMs).toBe(10000); expect(st.deepTimeMs).toBe(2000);
    expect(st.mostMissed[0]).toMatchObject({ id: "t1", misses: 1 });
    expect(st.chapters[0]).toMatchObject({ total: 2, solved: 2 });
    expect(st.unexplainedFailures).toBe(1);
  });
  it("a puzzle finished after a wrong try or with a hint still counts as done; a revealed one does not", () => {
    const exs = [fx("t1", BACK_RANK, "1.Rd8#"), fx("t2", SMOTHER, "1.Qg8+ Rxg8 2.Nf7#"), fx("t3", LADDER, "1.Rb7 Kh8 2.Ra8#")];
    let s = emptyProgress();
    s = recordAttempt(s, att({ exerciseId: "t1", result: "failed", finished: true }));
    s = recordAttempt(s, att({ exerciseId: "t2", result: "assisted", finished: true }));
    s = recordAttempt(s, att({ exerciseId: "t3", result: "failed", finished: false }));
    const st = computeStats(s, exs, 10);
    expect([...st.doneIds].sort()).toEqual(["t1", "t2"]);
    expect(st.solvedIds.size).toBe(0);
    expect(dueReviews(s, 10 + DAY).sort()).toEqual(["t1", "t2", "t3"]);
  });
  it("daily streak counts consecutive days and survives an untrained today", () => {
    const now = new Date(2026, 5, 10, 12).getTime();
    const a = [0, 1, 2].map((d) => att({ ts: now - d * DAY }));
    expect(streak(a, now)).toBe(3);
    expect(streak(a, now + DAY)).toBe(3);
    expect(streak(a, now + 2 * DAY)).toBe(0);
  });
});

describe("diagnostics", () => {
  const ex = fx("t4", LADDER, "1.Rb7 Kh8 (1...Kf8 2.Ra8#) 2.Ra8#");
  const deep = { plannedMinutes: 10, candidates: "", lines: "", evaluation: "" as const, finalAnswer: "" };
  it("does not guess a cause from a wrong move alone", () => {
    const d = diagnose(ex, att({ result: "failed", wrongMoves: ["Ra7"], timeMs: 60000 }));
    expect(d.findings).toEqual([]); expect(d.insufficient).toBe(true);
  });
  it("missing candidate, from the recorded candidate list", () => {
    const d = diagnose(ex, att({ result: "failed", timeMs: 600000, deep: { ...deep, candidates: "Ra8+, Rb8+", finalAnswer: "Ra8+" } }));
    expect(d.findings.map((f) => f.category)).toEqual(["missed_candidate"]);
  });
  it("visualization, from an illegal move inside a written line", () => {
    expect(replayLine(LADDER, "1.Rb7 Kh8 2.Rh6").illegal).toBeUndefined();
    const d = diagnose(ex, att({ result: "failed", timeMs: 600000, deep: { ...deep, candidates: "Rb7", lines: "1.Rb7 Kg7 2.Ra8", finalAnswer: "Ra7" } }));
    expect(d.findings.some((f) => f.category === "visualization" && f.basis === "evidence")).toBe(true);
  });
  it("overlooked defence vs calculation error, from where the line diverges", () => {
    const ex2 = fx("t2", SMOTHER, "1.Qg8+ Rxg8 2.Nf7#");
    const calc = diagnose(ex2, att({ result: "failed", timeMs: 600000, deep: { ...deep, lines: "1.Qg8+ Rxg8 2.Ng4", finalAnswer: "Qg8+" } }));
    expect(calc.findings.map((f) => f.category)).toContain("calculation");
    const def = diagnose(ex, att({ result: "failed", timeMs: 600000, deep: { ...deep, lines: "1.Rb7 Kf8 2.Ra8#", finalAnswer: "Ra7" } }));
    expect(def.findings.map((f) => f.category)).toContain("missed_defence");
  });
  it("evaluation and time management from recorded verdict and clock", () => {
    const d = diagnose(ex, att({ result: "failed", timeMs: 30000, deep: { ...deep, evaluation: "winning", finalAnswer: "Ra7" } }));
    expect(d.findings.map((f) => f.category).sort()).toEqual(["evaluation", "time_management"]);
  });
  it("self-reported tags are kept and labelled as such", () => {
    const d = diagnose(ex, att({ result: "failed", timeMs: 60000, selfReport: ["calculation"] }));
    expect(d.findings).toEqual([{ category: "calculation", basis: "self-reported", reason: "You tagged this yourself." }]);
  });
});

describe("hints and sharing", () => {
  it("only the last hint reveals the move", () => {
    const ex = fx("t2", SMOTHER, "1.Qg8+ Rxg8 2.Nf7#");
    const h = buildHints(ex.fen, ex.solution[0], 2);
    expect(h.slice(0, -1).every((x) => !x.reveals && !x.text.includes("Qg8"))).toBe(true);
    expect(h[1].text).toMatch(/check.*offers material/);
    expect(h[2].squares).toEqual(["b3"]);
    expect(h[3]).toMatchObject({ reveals: true, squares: ["b3", "g8"] });
  });
  it("partner session round-trips through a link", () => {
    const s = { v: 1 as const, fen: LADDER, label: "№ 5 — тест", notes: { name: "A", lines: "1.Rb7", evaluation: "winning", answer: "Rb7" } };
    expect(decodeSession("https://x.y/partner#s=" + encodeSession(s))).toEqual(s);
    expect(decodeSession("garbage")).toBeNull();
  });
});

import { buildCampaign, rankFor, totalXp, xpFor, LEVEL_SIZE } from "../game";
describe("campaign, unlocks and XP", () => {
  const exs = Array.from({ length: 30 }, (_, i) => fx(`g${i + 1}`, BACK_RANK, "1.Rd8#", { chapter: { id: i < 18 ? "stage-6" : "stage-7", title: i < 18 ? "Six" : "Seven" } }));
  it("regions follow the book's chapters, levels follow book order, last level is the boss", () => {
    const c = buildCampaign("test", exs, new Set());
    expect(c.regions.map((r) => r.title)).toEqual(["Six", "Seven"]);
    expect(c.regions[0].levels.map((l) => l.exerciseIds.length)).toEqual([LEVEL_SIZE, 6]);
    expect(c.levels[0].state).toBe("open"); expect(c.levels[1].state).toBe("locked");
    expect(c.regions[1].locked).toBe(true); expect(c.levels.map((l) => l.boss)).toEqual([false, true, true]);
  });
  it("clearing 70% opens the next level; free roam opens everything; unverified exercises never count", () => {
    const solved = new Set(exs.slice(0, 13).map((e) => e.id));
    const c = buildCampaign("test", exs, solved);
    expect(c.levels[0].state).toBe("cleared"); expect(c.levels[1].state).toBe("open"); expect(c.current?.id).toBe(c.levels[1].id);
    expect(buildCampaign("test", exs, new Set(), true).levels.every((l) => l.state === "open")).toBe(true);
    const review = exs.map((e, i) => (i === 0 ? { ...e, verification: { ...e.verification, status: "needs_review" as const } } : e));
    expect(buildCampaign("test", review, new Set()).levels[0].exerciseIds).not.toContain("g1");
  });
  it("XP rewards sustained calculation over speed and does not farm repeats", () => {
    const quick = xpFor({ result: "solved", mode: "flow", timeMs: 3000 }, 6);
    const deep = xpFor({ result: "solved", mode: "deep", timeMs: 15 * 60000, deep: { plannedMinutes: 20, candidates: "", lines: "1.Rd8#", evaluation: "", finalAnswer: "" } }, 6);
    expect(deep).toBeGreaterThan(quick * 2);
    expect(xpFor({ result: "failed", mode: "flow", timeMs: 1000 }, 6)).toBe(2);
    const byId = new Map(exs.map((e) => [e.id, e]));
    const once = totalXp({ version: 1, srs: {}, attempts: [att({ exerciseId: "g1", ts: 1 })] }, byId);
    const farmed = totalXp({ version: 1, srs: {}, attempts: [1, 2, 3, 4].map((t) => att({ exerciseId: "g1", ts: t })) }, byId);
    expect(farmed - once).toBe(15);
    expect(rankFor(0)).toMatchObject({ level: 1, into: 0 }); expect(rankFor(150).level).toBe(2);
  });
});

import { SAMPLE_PACK } from "../samples";
describe("bundled sample pack", () => {
  it("is labelled as original samples and every puzzle validates and ends in mate", () => {
    const r = validateDb(SAMPLE_PACK);
    expect(r.rejected).toEqual([]); expect(r.accepted).toHaveLength(8);
    expect(SAMPLE_PACK.book.edition).toMatch(/Not from any book/);
    for (const ex of r.accepted) {
      expect(ex.synthetic).toBe(true); expect(isTrainable(ex)).toBe(true);
      const c = new Chess(ex.fen);
      for (let n = ex.solution; n.length; n = n[0].children) c.move({ from: n[0].uci.slice(0, 2), to: n[0].uci.slice(2, 4), promotion: n[0].uci[4] });
      expect(c.isCheckmate()).toBe(true);
    }
  });
});

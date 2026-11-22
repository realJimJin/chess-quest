import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { coverage, graphFromLines, judge, ownPositions, pickReply, posKey, record, sanList, START_FEN, statKey, type DrillProgress } from "../graph";
import { groupsOf, YUNKER_LINES, yunkerRepertoire } from "../yunker";
import { nameMatches, repertoireFromPgn, splitPgn } from "../pgn";

const keyAfter = (moves: string) => { const c = new Chess(); for (const s of sanList(moves)) c.move(s); return posKey(c.fen()); };

describe("built-in repertoire", () => {
  it("every line is legal to its last move and ends on a move the player makes or can answer", () => {
    expect(YUNKER_LINES.length).toBeGreaterThan(20);
    for (const l of YUNKER_LINES) {
      const c = new Chess();
      for (const [i, s] of sanList(l.moves).entries()) expect(() => c.move(s), `${l.name}: move ${i + 1} ${s}`).not.toThrow();
    }
    expect(new Set(YUNKER_LINES.map((l) => l.id)).size).toBe(YUNKER_LINES.length);
  });
  it("White opens 1.d4 mainly and 1.c4 sometimes; Black answers 1.d4 and 1.e4", () => {
    const rep = yunkerRepertoire();
    const first = rep.white.nodes[rep.white.root];
    expect(first.mine).toBe(true);
    expect(first.edges.map((e) => e.san)).toEqual(["d4", "c4"]);
    const root = rep.black.nodes[rep.black.root];
    expect(root.mine).toBe(false);
    expect(root.edges.map((e) => e.san).sort()).toEqual(["d4", "e4"]);
    expect(rep.black.nodes[keyAfter("1. d4")].edges.map((e) => e.san)).toEqual(["Nf6", "d5"]);
    expect(rep.black.nodes[keyAfter("1. e4")].edges.map((e) => e.san)).toEqual(["c6", "d6", "e6"]);
  });
  it("move orders that reach the same position share one node", () => {
    const g = yunkerRepertoire().white;
    const a = keyAfter("1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 Re8 9. Nge2 Nf8 10. O-O c6");
    const b = keyAfter("1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. e3 Be7 7. Bd3 Nbd7 8. Qc2 O-O 9. Nge2 Re8 10. O-O Nf8");
    expect(a).toBe(b);
    expect(g.nodes[a].edges.map((e) => e.san)).toEqual(["f3"]);
    expect(g.nodes[a].edges[0].lines.length).toBe(2);
  });
  it("filters by opening", () => {
    expect(groupsOf("black")).toEqual(["Grünfeld", "Slav", "Caro-Kann", "French (occasional)", "Philidor (occasional)"]);
    const g = graphFromLines(YUNKER_LINES, "black", new Set(["Caro-Kann"]));
    expect(g.nodes[g.root].edges.map((e) => e.san)).toEqual(["e4"]);
    expect(g.nodes[keyAfter("1. e4")].edges.map((e) => e.san)).toEqual(["c6"]);
  });
});

describe("judging and drilling", () => {
  const g = yunkerRepertoire().black;
  it("accepts repertoire moves, rejects others, and names the main move", () => {
    const k = keyAfter("1. d4");
    expect(judge(g, k, { from: "g8", to: "f6" })).toMatchObject({ ok: true, share: 12 / 18 });
    expect(judge(g, k, { from: "d7", to: "d5" }).ok).toBe(true);
    const bad = judge(g, k, { from: "e7", to: "e5" });
    expect(bad.ok).toBe(false);
    expect(bad.main?.san).toBe("Nf6");
    expect(judge(g, "nowhere", { from: "a2", to: "a3" })).toMatchObject({ ok: false, main: null });
  });
  it("tracks progress per position and reports coverage", () => {
    const k = keyAfter("1. d4");
    let p: DrillProgress = {};
    p = record(p, "black", k, true, 1); p = record(p, "black", k, true, 2); p = record(p, "black", k, true, 3);
    expect(p[statKey("black", k)]).toEqual({ seen: 3, ok: 3, streak: 3, last: 3 });
    const c = coverage(g, p);
    expect(c).toMatchObject({ seen: 1, learned: 1 });
    expect(c.total).toBe(ownPositions(g).length);
    expect(c.total).toBeGreaterThan(80);
    expect(record(p, "black", k, false, 4)[statKey("black", k)].streak).toBe(0);
  });
  it("opponent replies follow frequency and lean toward what you know least", () => {
    expect(pickReply(g, g.root, {}, 0)?.san).toBeDefined();
    const sans = new Set(Array.from({ length: 50 }, (_, i) => pickReply(g, g.root, {}, i / 50)!.san));
    expect([...sans].sort()).toEqual(["d4", "e4"]);
    // once 1.d4 is well known, 1.e4 comes up more
    const known = { [statKey("black", keyAfter("1. d4"))]: { seen: 9, ok: 9, streak: 9, last: 0 } };
    const count = (p: DrillProgress) => Array.from({ length: 100 }, (_, i) => pickReply(g, g.root, p, i / 100)!.san).filter((s) => s === "e4").length;
    expect(count(known)).toBeGreaterThan(count({}));
    expect(pickReply(g, "nowhere", {}, 0.5)).toBeNull();
  });
});

describe("repertoire from a player's games", () => {
  const game = (white: string, black: string, moves: string, extra = "") => `[Event "Invented Open"]\n[White "${white}"]\n[Black "${black}"]\n[Result "*"]\n${extra}\n${moves} *\n`;
  const pgn = [
    game("Yunker, Alisa Genrietta", "Player, One", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7"),
    game("Yunker, Alisa Genrietta", "Player, Two", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4"),
    game("Yunker, Alisa Genrietta", "Player, Three", "1. c4 e5 2. Nc3 Nf6"),
    game("Player, Four", "Alisa Genrietta Yunker", "1. e4 c6 2. d4 d5 3. e5 Bf5"),
    game("Player, Five", "Yunker,A", "1. e4 c6 2. d4 d5 3. Nc3 dxe4"),
    game("Player, Six", "Player, Seven", "1. e4 e5 2. Nf3 Nc6"),
    game("Yunker, Alisa", "Player, Eight", "1. Kd4", '[FEN "8/8/8/8/8/2k5/8/2K5 w - - 0 1"]'),
  ].join("\n");

  it("splits games and matches names in any order", () => {
    expect(splitPgn(pgn)).toHaveLength(7);
    expect(nameMatches("Yunker, Alisa Genrietta", "alisa yunker")).toBe(true);
    expect(nameMatches("Yunker,A", "yunker")).toBe(true);
    expect(nameMatches("Player, One", "yunker")).toBe(false);
    expect(nameMatches("Yunker, Alisa", "")).toBe(false);
  });
  it("uses only her games, on the right side, weighted by how often she played each move", () => {
    const r = repertoireFromPgn(pgn, "Yunker");
    expect(r).toMatchObject({ total: 7, used: 5, asWhite: 3, asBlack: 2, unreadable: 1 });
    const { white, black } = r.repertoire;
    expect(white.nodes[white.root].edges.map((e) => [e.san, e.count])).toEqual([["d4", 2], ["c4", 1]]);
    expect(judge(white, white.root, { from: "d2", to: "d4" }).share).toBeCloseTo(2 / 3);
    expect(judge(white, white.root, { from: "e2", to: "e4" }).ok).toBe(false);
    expect(black.nodes[posKey(START_FEN)].edges.map((e) => e.san)).toEqual(["e4"]);
    expect(black.nodes[keyAfter("1. e4")].edges.map((e) => [e.san, e.count])).toEqual([["c6", 2]]);
    expect(black.nodes[keyAfter("1. e4 c6 2. d4 d5")].edges.map((e) => e.san).sort()).toEqual(["Nc3", "e5"]);
    expect(r.otherPlayers).toEqual(expect.arrayContaining(["Player, Six", "Player, Seven"]));
  });
  it("follows each game only as deep as asked, and reports a name that matches nothing", () => {
    const shallow = repertoireFromPgn(pgn, "Yunker", 2).repertoire.white;
    expect(Object.keys(shallow.nodes)).toHaveLength(2 + 1);   // start, after 1.d4, after 1.c4
    const none = repertoireFromPgn(pgn, "Nobody");
    expect(none.used).toBe(0);
    expect(none.otherPlayers.length).toBeGreaterThan(0);
  });
});

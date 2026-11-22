import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { readFileSync } from "node:fs";
import { graphFromLines, judge, posKey, sanList } from "./graph";
import { gameLines, selectGames, VERIFIED_GAMES } from "./verified";

describe("sourced Yunker repertoire", () => {
  it("has unique identities, legal moves, public game links and correctly assigned colors", () => {
    expect(VERIFIED_GAMES.length).toBeGreaterThan(1000);
    expect(new Set(VERIFIED_GAMES.map(g=>g.id)).size).toBe(VERIFIED_GAMES.length);
    for (const g of VERIFIED_GAMES) {
      expect(g.url).toMatch(/^https:\/\/(www\.chess\.com|lichess\.org)\//);
      expect(g[g.side]).toMatch(/Yunker/i);
      expect(g[g.side]).toMatch(/Alisa/i);
      const chess=new Chess();
      for (const san of g.moves) expect(()=>chess.move(san),`${g.id}: ${san}`).not.toThrow();
      expect(g.moves.length).toBeGreaterThanOrEqual(4);
      expect(g.moves.length).toBeLessThanOrEqual(40);
    }
  });
  it("separates tournament games, rapid/blitz, bullet, daily and recent periods", () => {
    expect(selectGames("tournament", "").length).toBeGreaterThan(80);
    expect(selectGames("tournament", "").every(g=>g.source==="tournament")).toBe(true);
    expect(selectGames("rapid-blitz", "").every(g=>g.source==="tournament" || ["rapid","blitz"].includes(g.timeClass))).toBe(true);
    expect(selectGames("all", "2026-01-01", "black").every(g=>g.date>="2026-01-01"&&g.side==="black")).toBe(true);
  });
  it("matches direct 2026 broadcasts including previously missing QGD and Slav branches", () => {
    const white=VERIFIED_GAMES.find(g=>g.url.endsWith('/VY0O4iaY'))!;
    const black=VERIFIED_GAMES.find(g=>g.url.endsWith('/dESIZY0Z'))!;
    expect(white.moves.slice(0,12)).toEqual(sanList("d4 Nf6 c4 e6 Nc3 d5 cxd5 exd5 Bg5 c6 Qc2 Be7"));
    expect(black.moves.slice(0,16)).toEqual(sanList("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 a5 e4 Bg4 Bxc4 e6 Be3 Bb4"));
  });
  it("accepts every recorded branch and counts games once in the selected tree", () => {
    for(const side of ["white","black"] as const){
      const games=selectGames("tournament","",side),graph=graphFromLines(gameLines(games,12),side);
      expect(graph.nodes[graph.root].edges.reduce((n,e)=>n+e.count,0)).toBe(games.length);
      for(const g of games){
        const c=new Chess();
        for(const san of g.moves.slice(0,24)){
          const key=posKey(c.fen()),m=c.move(san);
          expect(judge(graph,key,m).ok,`${g.id} ${san}`).toBe(true);
        }
      }
    }
  });
  it("does not inflate game frequencies when a source repeats a position", () => {
    const g=graphFromLines([{id:"repetition-fixture",name:"Test only",side:"white",group:"Test",weight:1,moves:"Nf3 Nf6 Ng1 Ng8 Nf3 Nf6"}],"white");
    expect(g.nodes[g.root].edges[0].count).toBe(1);
  });
  it("exports every full game as readable PGN without clock/engine comments", () => {
    const pgn=readFileSync("public/openings/yunker-verified-games.pgn","utf8");
    expect(pgn).not.toContain("[%clk");
    const games=pgn.split(/\n\s*(?=\[Event\s)/);
    expect(games.length).toBe(VERIFIED_GAMES.length);
    for(const game of games) expect(()=>new Chess().loadPgn(game,{strict:false})).not.toThrow();
  });
});

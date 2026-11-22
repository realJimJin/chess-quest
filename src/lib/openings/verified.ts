import data from "./data/yunker-games.json";
import { emptyGraph, type Line, type Repertoire, type Side } from "./graph";

export interface VerifiedGame {
  id: string; side: Side; group: string; opening: string; eco: string;
  white: string; black: string; date: string; event: string;
  source: "online" | "tournament"; url: string; timeClass: string;
  timeControl: string; result: string; moves: string[];
}
export const VERIFIED_GAMES = data as VerifiedGame[];
export type GamePool = "tournament" | "rapid-blitz" | "all";
export const gameLabel = (g: VerifiedGame) => `${g.date} · ${g.side === "white" ? g.black : g.white}`;
export function selectGames(pool: GamePool, since: string, side?: Side): VerifiedGame[] {
  return VERIFIED_GAMES.filter(g => (!side || g.side === side) && g.date >= since &&
    (pool === "all" || (pool === "tournament" ? g.source === "tournament" : g.source === "tournament" || ["rapid", "blitz"].includes(g.timeClass))));
}
export function gameLines(games: VerifiedGame[], depth: number): Line[] {
  return games.map(g => ({id:g.id, name:g.id, side:g.side, group:g.group, moves:g.moves.slice(0,depth * 2).join(" "), weight:1}));
}
export function verifiedRepertoire(pool: GamePool, since: string, depth: number): Repertoire {
  const games=selectGames(pool,since);
  return {id:"yunker-verified",name:"Alisa Yunker · verified games",source:"games",
    note:`${games.length} sourced games in this selection. Every accepted move was played in a recorded game. Frequencies describe this sample, not her complete repertoire or the best move.`,
    lines:gameLines(games,depth), white:emptyGraph("white"),black:emptyGraph("black"),
    games:{used:games.length,asWhite:games.filter(g=>g.side==="white").length,asBlack:games.filter(g=>g.side==="black").length,players:["Alisa Genrietta Yunker"]}};
}

// Coaching prompts, not quotations or claims that she follows these plans in every game.
export const STUDY_DAYS: {title:string;side:Side;groups:string[];task:string}[] = [
  {title:"Day 1 · White foundations",side:"white",groups:["Queen’s Gambit Declined","Queen’s Gambit Accepted","Slav / Semi-Slav"],task:"Learn the most frequent d4/c4 branches to move 8, then recall them. In each final position, name the pawn break, worst-placed piece and opponent’s threat."},
  {title:"Day 2 · English and Indian systems",side:"white",groups:["English","Nimzo-Indian","King’s Indian","Benoni","Benoni / Benko","Grünfeld","Queen’s Indian","Catalan"],task:"Include her English branches, then separate the Nc3/Qc2, f3 and f4 setups by the opponent’s move order. Extend your chosen lines to move 12; write down what changes when Black plays …c5 or …d5."},
  {title:"Day 3 · Black against e4",side:"black",groups:["Caro-Kann"],task:"Cover Advance, Exchange/Panov, Two Knights and the Nc3/Nd2 systems separately. Learn when she uses …c5, …Bf5 or …Nf6 from the actual branches; then replay mistakes without hints."},
  {title:"Day 4 · Black against d4 and flanks",side:"black",groups:["Slav / Semi-Slav","Grünfeld","Other queen’s-pawn systems","Réti / flank openings","English"],task:"Train the Exchange Slav and …dxc4 branches first. Then inspect the recorded Nf3, c4 and unusual first moves. Do not force a memorized setup when the center has changed."},
  {title:"Day 5 · Recall and light review",side:"white",groups:[],task:"Do short recall sessions with both colors. Revisit misses and inspect one complete source game per main opening. Finish with familiar lines; avoid adding a new repertoire on the final evening."},
];

// A starter repertoire modelled on the openings WFM Alisa Genrietta Yunker is
// reported to play. The moves are standard main-line theory for those openings,
// NOT taken from her games: import a PGN of her games to drill her actual moves.
import { graphFromLines, type Line, type Repertoire } from "./graph";

const W = (id: string, group: string, name: string, moves: string, weight = 3): Line => ({ id, group, name, side: "white", moves, weight });
const B = (id: string, group: string, name: string, moves: string, weight = 3): Line => ({ id, group, name, side: "black", moves, weight });

export const YUNKER_LINES: Line[] = [
  // ---- White: 1.d4, occasionally 1.c4
  W("w-qgd-1", "Queen's Gambit Declined", "QGD Exchange, Nge2 setup", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2 Re8 9. Nge2 Nf8 10. O-O c6 11. f3"),
  W("w-qgd-2", "Queen's Gambit Declined", "QGD Exchange, …c6 move order", "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 c6 6. e3 Be7 7. Bd3 Nbd7 8. Qc2 O-O 9. Nge2 Re8 10. O-O Nf8 11. f3"),
  W("w-qgd-3", "Queen's Gambit Declined", "QGD Exchange vs 3…Be7", "1. d4 d5 2. c4 e6 3. Nc3 Be7 4. cxd5 exd5 5. Bf4 c6 6. e3 Bf5 7. g4 Be6 8. h4"),
  W("w-qgd-4", "Queen's Gambit Declined", "QGD Exchange via 1…Nf6 2…e6", "1. d4 Nf6 2. c4 e6 3. Nc3 d5 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3 Nbd7 8. Qc2"),
  W("w-slav-1", "Slav (as White)", "Exchange Slav", "1. d4 d5 2. c4 c6 3. cxd5 cxd5 4. Nc3 Nf6 5. Bf4 Nc6 6. e3 a6 7. Bd3 Bg4 8. Nge2 e6 9. O-O"),
  W("w-slav-2", "Slav (as White)", "Exchange Slav, …Bf5", "1. d4 d5 2. c4 c6 3. cxd5 cxd5 4. Nc3 Nf6 5. Bf4 Nc6 6. e3 Bf5 7. Qb3 Na5 8. Qa4+ Bd7 9. Qc2"),
  W("w-kid-1", "King's Indian (as White)", "Four Pawns Attack, …c5", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4 O-O 6. Nf3 c5 7. d5 e6 8. Be2 exd5 9. cxd5 Bg4 10. O-O"),
  W("w-kid-2", "King's Indian (as White)", "Four Pawns Attack, …Na6", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. f4 O-O 6. Nf3 Na6 7. Be2 e5 8. fxe5 dxe5 9. d5"),
  W("w-gru-1", "Grünfeld (as White)", "Exchange Grünfeld, Nf3 and Be3", "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7 7. Nf3 c5 8. Be3 Qa5 9. Qd2 Nc6 10. Rc1"),
  W("w-ben-1", "Modern Benoni (as White)", "Pawn storm with f4 and Bb5+", "1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4 g6 7. f4 Bg7 8. Bb5+ Nfd7 9. a4 O-O 10. Nf3"),
  W("w-eng-1", "English (occasional)", "English, reversed Dragon", "1. c4 e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nb6 6. Nf3 Nc6 7. O-O Be7 8. d3", 1),

  // ---- Black against 1.d4
  B("b-gru-1", "Grünfeld", "Exchange, 7.Nf3 c5 8.Be3", "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7 7. Nf3 c5 8. Be3 Qa5 9. Qd2 Nc6 10. Rc1 cxd4 11. cxd4 Qxd2+ 12. Kxd2 O-O"),
  B("b-gru-2", "Grünfeld", "Exchange, 7.Bc4", "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7 7. Bc4 c5 8. Ne2 Nc6 9. Be3 O-O 10. O-O Bg4 11. f3 Na5"),
  B("b-gru-3", "Grünfeld", "Russian System", "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. Nf3 Bg7 5. Qb3 dxc4 6. Qxc4 O-O 7. e4 a6 8. Be2 b5 9. Qb3 c5"),
  B("b-gru-4", "Grünfeld", "4.Bf4", "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. Bf4 Bg7 5. e3 c5 6. dxc5 Qa5 7. Rc1 dxc4 8. Bxc4 O-O 9. Nf3 Qxc5"),
  B("b-slav-1", "Slav", "Main line with …dxc4 and …Bf5", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O Nbd7 9. Qe2 O-O", 2),
  B("b-slav-2", "Slav", "Exchange Slav", "1. d4 d5 2. c4 c6 3. cxd5 cxd5 4. Nc3 Nf6 5. Bf4 Nc6 6. e3 a6 7. Bd3 Bg4 8. Nge2 e6", 2),
  B("b-slav-3", "Slav", "Quiet 4.e3 Bf5", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. e3 Bf5 5. Nc3 e6 6. Nh4 Bg6 7. Nxg6 hxg6 8. Bd3 Nbd7", 2),

  // ---- Black against 1.e4
  B("b-ck-1", "Caro-Kann", "Advance, Short system", "1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6 5. Be2 c5 6. Be3 cxd4 7. Nxd4 Ne7 8. O-O Nbc6"),
  B("b-ck-2", "Caro-Kann", "Classical", "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7 9. Bd3 Bxd3 10. Qxd3 e6"),
  B("b-ck-3", "Caro-Kann", "Exchange", "1. e4 c6 2. d4 d5 3. exd5 cxd5 4. Bd3 Nc6 5. c3 Nf6 6. Bf4 Bg4 7. Qb3 Qd7 8. Nd2 e6"),
  B("b-ck-4", "Caro-Kann", "Panov Attack", "1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 Nf6 5. Nc3 e6 6. Nf3 Bb4 7. cxd5 Nxd5 8. Bd2 Nc6 9. Bd3 O-O"),
  B("b-fr-1", "French (occasional)", "Advance", "1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3 Nh6 7. b4 cxd4 8. cxd4 Nf5 9. Bb2 Bd7", 1),
  B("b-ph-1", "Philidor (occasional)", "Hanham setup", "1. e4 d6 2. d4 Nf6 3. Nc3 e5 4. Nf3 Nbd7 5. Bc4 Be7 6. O-O O-O 7. Re1 c6 8. a4 b6", 1),
];

export const groupsOf = (side: "white" | "black"): string[] => [...new Set(YUNKER_LINES.filter((l) => l.side === side).map((l) => l.group))];

export function yunkerRepertoire(): Repertoire {
  return {
    id: "builtin:yunker", name: "Yunker-style starter (standard theory)", source: "builtin",
    note: "Main-line theory for the openings she is reported to play. These are not her game moves: import a PGN of her games to drill exactly what she played.",
    white: graphFromLines(YUNKER_LINES, "white"), black: graphFromLines(YUNKER_LINES, "black"), lines: YUNKER_LINES,
  };
}

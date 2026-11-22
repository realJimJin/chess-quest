export interface OpeningLine {
  id: string;
  title: string;
  subtitle: string;
  side: "white" | "black";
  moves: string[];
  plan: string;
  notes: Record<number, string>;
  source: { url: string; game: string; year: number };
}

const line = (id: string, title: string, subtitle: string, side: OpeningLine["side"], moves: string, plan: string, notes: OpeningLine["notes"], gameId: string, game: string, year = 2024): OpeningLine =>
  ({ id, title, subtitle, side, moves: moves.split(" "), plan, notes, source: { url: `https://www.chess.com/games/view/${gameId}`, game, year } });

// Opening excerpts transcribed from the linked, publicly replayable game scores.
// Notes are original teaching commentary, not quotations or engine evaluations.
export const OPENING_LINES: OpeningLine[] = [
  line("yunker-qgd-exchange", "Queen’s Gambit", "Exchange · the minority attack", "white",
    "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 Qc2 Be7 e3 Nbd7 Bd3 O-O Nge2 Re8 O-O Nf8 Rab1 a5 a3",
    "Exchange on d5, develop without blocking the f-pawn, then prepare queenside expansion. This game reaches the familiar Carlsbad pawn structure.",
    { 0: "Occupy the center with d4, then challenge Black’s d-pawn with c4.", 6: "Exchanging on d5 fixes the central pawn structure.", 16: "Nge2 leaves the f-pawn free. Both a later f3–e4 break and queenside play remain possible.", 20: "Rab1 supports a later b4 advance. Prepare the pawn break before pushing." },
    "17707815", "Yunker – Toktomushev", 2025),
  line("yunker-nimzo-qc2", "Meet the Nimzo-Indian", "Classical · keep the pawn structure", "white",
    "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 d5 Bg5 O-O e3 Nbd7 cxd5 exd5 Nf3 h6 Bh4 Re8 Bd3 c6 O-O",
    "Qc2 prepares to recapture on c3 with the queen if Black exchanges the bishop. Finish development and secure the king before choosing a pawn break.",
    { 6: "Qc2 supports the c3-knight and a queen recapture on c3.", 12: "The exchange on d5 clarifies the center before completing development.", 18: "Bd3 points toward h7 and clears the way to castle." },
    "17401457", "Yunker – Shapiro"),
  line("yunker-four-pawns", "Four Pawns center", "King’s Indian → Modern Benoni", "white",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5 d5 e6 Be2 exd5 cxd5",
    "Build a broad pawn center, then support it with pieces. The opening starts as a King’s Indian and becomes a Modern Benoni structure after …c5, d5 and …e6.",
    { 8: "f4 takes more central space, but also makes development and king safety urgent.", 12: "d5 closes the center after …c5. Black will challenge the chain with …e6.", 16: "Recapture with the c-pawn to maintain the d5 spearhead." },
    "17326465", "Yunker – Vyatkin"),
  line("yunker-caro-advance", "Caro-Kann: Advance", "Meet the Tal variation", "black",
    "e4 c6 d4 d5 e5 Bf5 h4 h5 Bd3 Bxd3 Qxd3 e6 Nf3 Qa5+ c3 Qa6 Qc2 c5",
    "Develop the light-squared bishop before playing …e6. Against the h-pawn advance, this game uses …h5, exchanges bishops, and challenges d4 with …c5.",
    { 1: "…c6 prepares …d5 with pawn support.", 5: "Bring the bishop outside the pawn chain before closing it with …e6.", 7: "…h5 stops an immediate h5 advance by White.", 17: "…c5 strikes at the base of White’s pawn chain on d4." },
    "17311869", "Mejia – Yunker"),
  line("yunker-caro-panov", "Caro-Kann: Panov", "Develop, castle, challenge c5", "black",
    "e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 Nc6 Nf3 e6 c5 Be7 Bd3 O-O O-O b6 cxb6 Qxb6",
    "Meet White’s c4 with active development. After c5, the …b6 break challenges the advanced pawn and opens lines for the pieces.",
    { 5: "Recapture with the c-pawn, keeping a pawn in the center.", 11: "…e6 supports d5 and releases the dark-squared bishop.", 17: "…b6 challenges White’s space on the queenside." },
    "17322893", "Kotyk – Yunker"),
  line("yunker-caro-tartakower", "Caro-Kann: Tartakower", "Activity after doubled pawns", "black",
    "e4 c6 Nc3 d5 d4 dxe4 Nxe4 Nf6 Nxf6+ exf6 c3 Bd6 Bd3 O-O Ne2 Re8",
    "Accept doubled f-pawns in return for quick development and an open e-file. Keep the king safe, then place a rook on that file.",
    { 7: "…Nf6 challenges the centralized knight.", 9: "…exf6 opens the e-file; this is the defining Tartakower recapture.", 15: "…Re8 brings the rook onto the open file." },
    "17341811", "Skotheim – Yunker"),
  line("yunker-slav-exchange", "Slav: Exchange", "Respond to an early f3 and e4", "black",
    "d4 d5 c4 c6 cxd5 cxd5 Nc3 Nc6 f3 Nf6 e4 dxe4 d5 Ne5 fxe4 Bd7",
    "Start with a solid Slav center. This particular opponent uses an early f3 and e4; practice meeting the central break and moving the attacked knight.",
    { 3: "…c6 supports d5 without blocking the light-squared bishop.", 11: "Capture on e4 when White expands in the center.", 13: "The pawn on d5 attacks the c6-knight. In this game it retreats to e5." },
    "17313235", "Lotero – Yunker"),
  line("yunker-slav-fianchetto", "Slav to Grünfeld", "A fianchetto against Bf4", "black",
    "d4 c6 c4 d5 Nf3 Nf6 Nc3 g6 Bf4 Bg7 e3 O-O h3 Ne4",
    "A …c6 move order leads to a fianchetto setup. Develop the bishop to g7, castle, and use the e4 square. This is one recorded game, not a claim about her preferred main line.",
    { 7: "…g6 prepares the bishop for the long diagonal.", 11: "Castle before beginning active central play.", 13: "…Ne4 occupies a central outpost supported by d5." },
    "17326181", "Rietze – Yunker"),
];

export const OPENING_DISCLAIMER = "Study opening excerpts from Alisa Genrietta Yunker’s recorded games. These are specific game choices, not a complete repertoire or a promise of the best move in every position. Teaching notes are by Chess Quest. No affiliation or endorsement.";

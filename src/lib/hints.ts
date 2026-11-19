import { Chess } from "chess.js";
import type { SolNode } from "./types";

export interface Hint { text: string; squares: string[]; reveals: boolean }
const NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** Progressively stronger hints for the next book move; only the last reveals it. */
export function buildHints(fen: string, node: SolNode, remainingSolverMoves: number): Hint[] {
  const chess = new Chess(fen);
  const from = node.uci.slice(0, 2), to = node.uci.slice(2, 4);
  const piece = chess.get(from as never);
  const target = chess.get(to as never);
  const kind = node.san.includes("#") ? "a checkmate" : node.san.includes("+") ? "a check" : node.san.includes("x") ? "a capture" : "a quiet move — no check, no capture";
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  chess.move({ from, to, promotion: node.uci[4] });
  const sac = piece && chess.isAttacked(to as never, chess.turn()) && (!target || values[target.type] < values[piece.type]);
  return [
    { text: `List every check, capture and threat first. The solution needs ${remainingSolverMoves} more move${remainingSolverMoves === 1 ? "" : "s"} from you.`, squares: [], reveals: false },
    { text: `The move is ${kind}${sac ? ", and it offers material" : ""}.`, squares: [], reveals: false },
    { text: `Look at what your ${piece ? NAMES[piece.type] : "piece"} on ${from} can do.`, squares: [from], reveals: false },
    { text: `The move is ${node.san}.`, squares: [from, to], reveals: true },
  ];
}

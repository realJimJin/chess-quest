import { Chess } from "chess.js";
import type { SolNode } from "./types";

export interface Puzzle { fen: string; options: SolNode[]; played: string[]; done: boolean }
export interface MoveInput { from: string; to: string; promotion?: string }

export type MoveOutcome =
  | { kind: "illegal" }
  | { kind: "book"; puzzle: Puzzle; san: string; reply?: SolNode }
  | { kind: "mate"; puzzle: Puzzle; san: string }
  | { kind: "offbook"; san: string; uci: string; fenAfter: string };

export const createPuzzle = (fen: string, solution: SolNode[]): Puzzle =>
  ({ fen, options: solution, played: [], done: solution.length === 0 });

export const toUci = (m: MoveInput) => m.from + m.to + (m.promotion ?? "");

/** Apply the solver's move. Never calls a legal move "wrong": anything that is
 *  not the book move and not checkmate comes back as `offbook` for the engine
 *  (or the user) to judge. */
export function tryMove(p: Puzzle, input: MoveInput): MoveOutcome {
  const chess = new Chess(p.fen);
  let mv;
  try { mv = chess.move({ from: input.from, to: input.to, promotion: input.promotion }); } catch { return { kind: "illegal" }; }
  if (!mv) return { kind: "illegal" };
  const uci = mv.from + mv.to + (mv.promotion ?? "");
  const node = p.options.find((n) => n.uci === uci);
  if (node) {
    const played = [...p.played, mv.san];
    if (node.children.length === 0) return { kind: "book", san: mv.san, puzzle: { fen: chess.fen(), options: [], played, done: true } };
    const reply = node.children[0];
    chess.move({ from: reply.uci.slice(0, 2), to: reply.uci.slice(2, 4), promotion: reply.uci[4] });
    return { kind: "book", san: mv.san, reply,
      puzzle: { fen: chess.fen(), options: reply.children, played: [...played, reply.san], done: reply.children.length === 0 } };
  }
  if (chess.isCheckmate()) return { kind: "mate", san: mv.san, puzzle: { fen: chess.fen(), options: [], played: [...p.played, mv.san], done: true } };
  return { kind: "offbook", san: mv.san, uci, fenAfter: chess.fen() };
}

export function needsPromotion(fen: string, from: string, to: string): boolean {
  const chess = new Chess(fen);
  const piece = chess.get(from as never);
  if (!piece || piece.type !== "p") return false;
  if (!(to.endsWith("8") || to.endsWith("1"))) return false;
  return chess.moves({ square: from as never, verbose: true }).some((m) => m.to === to && m.promotion);
}

export function legalDests(fen: string): Map<string, string[]> {
  const chess = new Chess(fen);
  const dests = new Map<string, string[]>();
  for (const m of chess.moves({ verbose: true })) dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  return dests;
}

export function mainline(nodes: SolNode[]): SolNode[] {
  const out: SolNode[] = [];
  for (let cur = nodes; cur.length; cur = cur[0].children) out.push(cur[0]);
  return out;
}

/** Render a solution tree as numbered text, e.g. "1.Rb7 Kh8 (1...Kf8 2.Ra8#) 2.Ra8#". */
export function formatSolution(fen: string, nodes: SolNode[]): string {
  const [, turn, , , , full] = fen.split(" ");
  const walk = (ns: SolNode[], ply: number, forceNum: boolean): string => {
    if (!ns.length) return "";
    const num = Math.floor(ply / 2) + Number(full || 1);
    const white = ply % 2 === 0;
    const label = (n: SolNode, force: boolean) => (white ? `${num}.` : force ? `${num}...` : "") + n.san;
    const [main, ...alts] = ns;
    let s = label(main, forceNum);
    for (const a of alts) s += ` (${label(a, true)}${a.children.length ? " " + walk(a.children, ply + 1, false) : ""})`;
    const rest = walk(main.children, ply + 1, alts.length > 0);
    return rest ? `${s} ${rest}` : s;
  };
  return walk(nodes, turn === "b" ? 1 : 0, true);
}

/** Parse user-typed solution text (SAN, optional move numbers, PGN-style
 *  parentheses) into a legal move tree. Throws on the first illegal move. */
export function parseSolutionText(fen: string, text: string): SolNode[] {
  const roots: SolNode[] = [];
  const clean = text.replace(/[!?]+/g, "").replace(/\b0-0-0\b/g, "O-O-O").replace(/\b0-0\b/g, "O-O");
  const tokens = clean.match(/\(|\)|O-O-O[+#]?|O-O[+#]?|[KQRBN]?[a-h]?[1-8]?[x-]?[a-h][1-8](?:=?[QRBN])?[+#]?/g) ?? [];
  type Ctx = { chess: Chess; sibs: SolNode[]; prevFen: string; prevSibs: SolNode[] };
  const stack: Ctx[] = [{ chess: new Chess(fen), sibs: roots, prevFen: fen, prevSibs: roots }];
  for (const t of tokens) {
    const ctx = stack[stack.length - 1];
    if (t === "(") { stack.push({ chess: new Chess(ctx.prevFen), sibs: ctx.prevSibs, prevFen: ctx.prevFen, prevSibs: ctx.prevSibs }); continue; }
    if (t === ")") { if (stack.length > 1) stack.pop(); continue; }
    const before = ctx.chess.fen();
    let mv;
    try { mv = ctx.chess.move(t.replace("-", (m) => (t.startsWith("O") ? m : "")), { strict: false }); }
    catch { throw new Error(`Illegal or unreadable move "${t}"`); }
    const uci = mv.from + mv.to + (mv.promotion ?? "");
    let node = ctx.sibs.find((n) => n.uci === uci);
    if (!node) { node = { san: mv.san, uci, children: [] }; ctx.sibs.push(node); }
    ctx.prevFen = before; ctx.prevSibs = ctx.sibs; ctx.sibs = node.children;
  }
  if (!roots.length) throw new Error("No moves found");
  return roots;
}

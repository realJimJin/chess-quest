// Opening repertoire as a graph of positions. Positions reached by different
// move orders share one node, so transpositions are trained once.
import { Chess } from "chess.js";

export type Side = "white" | "black";
/** One move out of a position. `count` is how often it was played (games), or a weight for built-in lines. */
export interface Edge { uci: string; san: string; to: string; count: number; lines: string[] }
/** `mine` is true when the repertoire's owner is to move. */
export interface Pos { fen: string; mine: boolean; edges: Edge[] }
export interface Graph { side: Side; root: string; nodes: Record<string, Pos> }
export interface Line { id: string; group: string; name: string; side: Side; moves: string; weight?: number }
export interface Repertoire {
  id: string; name: string; source: "builtin" | "games"; note: string;
  white: Graph; black: Graph;
  /** built-in only: the lines the graphs were made from, so they can be filtered by opening */
  lines?: Line[];
  games?: { used: number; asWhite: number; asBlack: number; players: string[] };
}

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** Position identity: placement, side to move, castling rights and en-passant square. */
export const posKey = (fen: string): string => fen.split(" ").slice(0, 4).join(" ");
export const emptyGraph = (side: Side): Graph => ({ side, root: posKey(START_FEN), nodes: {} });
/** "1. d4 Nf6 2. c4" -> ["d4", "Nf6", "c4"] */
export const sanList = (moves: string): string[] => moves.replace(/\d+\.(\.\.)?/g, " ").trim().split(/\s+/).filter(Boolean);

/** Add one game or line to the graph. Stops quietly at the first illegal move
 *  and returns how many plies were added. */
export function addMoves(g: Graph, sans: string[], line = "", weight = 1, maxPlies = 80): number {
  const c = new Chess();
  let plies = 0;
  for (const san of sans.slice(0, maxPlies)) {
    const fen = c.fen(), key = posKey(fen);
    let mv;
    try { mv = c.move(san, { strict: false }); } catch { break; }
    const node = (g.nodes[key] ??= { fen, mine: (fen.split(" ")[1] === "w") === (g.side === "white"), edges: [] });
    const uci = mv.from + mv.to + (mv.promotion ?? "");
    let e = node.edges.find((x) => x.uci === uci);
    if (!e) { e = { uci, san: mv.san, to: posKey(c.fen()), count: 0, lines: [] }; node.edges.push(e); }
    e.count += weight;
    if (line && !e.lines.includes(line) && e.lines.length < 8) e.lines.push(line);
    plies++;
  }
  for (const n of Object.values(g.nodes)) n.edges.sort((a, b) => b.count - a.count || a.san.localeCompare(b.san));
  return plies;
}

export function graphFromLines(lines: Line[], side: Side, groups?: Set<string>): Graph {
  const g = emptyGraph(side);
  for (const l of lines) {
    if (l.side !== side || (groups && groups.size && !groups.has(l.group))) continue;
    const sans = sanList(l.moves);
    if (addMoves(g, sans, l.name, l.weight ?? 3) !== sans.length) throw new Error(`illegal move in line "${l.name}"`);
  }
  return g;
}

/** Positions where the owner has a move to play, reachable from the start. */
export function ownPositions(g: Graph): string[] {
  const seen = new Set<string>(), out: string[] = [], queue = [g.root];
  while (queue.length) {
    const k = queue.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    const n = g.nodes[k];
    if (!n || !n.edges.length) continue;
    if (n.mine) out.push(k);
    for (const e of n.edges) queue.push(e.to);
  }
  return out;
}

export interface Verdict {
  ok: boolean;
  /** the move as it is in the repertoire, when ok */
  edge: Edge | null;
  /** the most-played move here */
  main: Edge | null;
  /** share of games/weight the played move has here, 0..1 */
  share: number;
}
/** Is this move one the repertoire plays in this position? */
export function judge(g: Graph, key: string, m: { from: string; to: string; promotion?: string }): Verdict {
  const node = g.nodes[key];
  const main = node?.edges[0] ?? null;
  if (!node) return { ok: false, edge: null, main, share: 0 };
  const uci = m.from + m.to + (m.promotion ?? "");
  const edge = node.edges.find((e) => e.uci === uci) ?? null;
  const total = node.edges.reduce((s, e) => s + e.count, 0);
  return { ok: !!edge, edge, main, share: edge && total ? edge.count / total : 0 };
}

// ------------------------------------------------------------------ progress
export interface PosStat { seen: number; ok: number; streak: number; last: number }
export type DrillProgress = Record<string, PosStat>;
export const LEARNED_STREAK = 3;
export const statKey = (side: Side, key: string) => `${side[0]}|${key}`;

export function record(p: DrillProgress, side: Side, key: string, ok: boolean, now: number): DrillProgress {
  const k = statKey(side, key), old = p[k] ?? { seen: 0, ok: 0, streak: 0, last: 0 };
  return { ...p, [k]: { seen: old.seen + 1, ok: old.ok + (ok ? 1 : 0), streak: ok ? old.streak + 1 : 0, last: now } };
}

export function coverage(g: Graph, p: DrillProgress): { total: number; seen: number; learned: number } {
  const keys = ownPositions(g);
  let seen = 0, learned = 0;
  for (const k of keys) { const s = p[statKey(g.side, k)]; if (s?.seen) seen++; if ((s?.streak ?? 0) >= LEARNED_STREAK) learned++; }
  return { total: keys.length, seen, learned };
}

/** The opponent's reply: by how often it was played, leaning toward branches
 *  whose next position you know least. `rnd` is a number in [0, 1). */
export function pickReply(g: Graph, key: string, p: DrillProgress, rnd: number): Edge | null {
  const node = g.nodes[key];
  if (!node || !node.edges.length) return null;
  const weights = node.edges.map((e) => e.count / (1 + (p[statKey(g.side, e.to)]?.streak ?? 0)));
  let x = rnd * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return node.edges[i]; }
  return node.edges[node.edges.length - 1];
}

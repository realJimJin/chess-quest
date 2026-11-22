import { Chess, DEFAULT_POSITION } from "chess.js";
import type { MoveInput } from "../puzzle";
import type { OpeningLine } from "./catalog";

export interface OpeningStep { fen: string; after: string; san: string; from: string; to: string; promotion?: string; side: "white" | "black" }
export function compileLine(line: OpeningLine): OpeningStep[] {
  const chess = new Chess();
  return line.moves.map(san => {
    const fen = chess.fen();
    const move = chess.move(san);
    return { fen, after: chess.fen(), san: move.san, from: move.from, to: move.to, promotion: move.promotion, side: move.color === "w" ? "white" : "black" };
  });
}
export interface OpeningSession {
  mode: "learn" | "recall";
  ply: number;
  mistakes: number[];
  assisted: number[];
  feedback: string;
  resetKey: number;
}
export const newSession = (mode: OpeningSession["mode"]): OpeningSession => ({ mode, ply: 0, mistakes: [], assisted: [], feedback: "", resetKey: 0 });
export const positionAt = (steps: OpeningStep[], ply: number) => ply === 0 ? DEFAULT_POSITION : steps[ply - 1].after;
export const isYourTurn = (steps: OpeningStep[], side: OpeningLine["side"], session: OpeningSession) => steps[session.ply]?.side === side;
const include = (items: number[], item: number) => items.includes(item) ? items : [...items, item];
export function advanceOpponent(steps: OpeningStep[], side: OpeningLine["side"], session: OpeningSession): OpeningSession {
  if (!steps[session.ply] || isYourTurn(steps, side, session)) return session;
  return { ...session, ply: session.ply + 1, feedback: `Opponent played ${steps[session.ply].san}.` };
}
export function revealOpeningMove(session: OpeningSession): OpeningSession {
  return { ...session, assisted: include(session.assisted, session.ply) };
}
export function attemptOpeningMove(steps: OpeningStep[], side: OpeningLine["side"], session: OpeningSession, input: MoveInput): OpeningSession {
  const expected = steps[session.ply];
  if (!expected || !isYourTurn(steps, side, session)) return session;
  let move;
  try { move = new Chess(expected.fen).move(input); } catch {
    return { ...session, resetKey: session.resetKey + 1, feedback: "That move is not legal in this position." };
  }
  if (move.from !== expected.from || move.to !== expected.to || move.promotion !== expected.promotion) {
    return { ...session, resetKey: session.resetKey + 1, mistakes: include(session.mistakes, session.ply), feedback: `${move.san} is legal, but this game follows a different move. Try again or reveal the move.` };
  }
  return { ...session, ply: session.ply + 1, feedback: `${move.san} — the move from the game.` };
}
export function sessionScore(steps: OpeningStep[], side: OpeningLine["side"], session: OpeningSession) {
  const total = steps.filter(step => step.side === side).length;
  const missed = new Set([...session.mistakes, ...session.assisted]).size;
  return { total, correct: total - missed, accuracy: Math.round((total - missed) / total * 100) };
}

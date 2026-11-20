import { Chess } from "chess.js";
import type { MoveInput } from "../../lib/puzzle";

/** Translate a player's typed move using the same legality rules as the board.
 * This only parses input; Runner still owns solution checking and scoring. */
export function parseNotation(fen: string, text: string): MoveInput | null {
  const notation = text.trim().replace(/^\d+\.(?:\.\.)?\s*/, "");
  if (!notation) return null;
  try {
    const move = new Chess(fen).move(notation, { strict: false });
    return { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) };
  } catch {
    return null;
  }
}

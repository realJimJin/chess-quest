import type { Exercise, SolNode } from "../types";
import { parseSolutionText } from "../puzzle";

// Synthetic test positions written for this test suite — NOT book content.
export function fx(id: string, fen: string, sol: string | SolNode[], over: Partial<Exercise> = {}): Exercise {
  return {
    id, bookId: "test", chapter: { id: "stage-6", title: "Test" }, number: Number(id.replace(/\D/g, "")) || 1,
    pdfPage: 1, fen, sideToMove: fen.split(" ")[1] === "w" ? "white" : "black", instruction: "", solutionRaw: typeof sol === "string" ? sol : "",
    solution: typeof sol === "string" ? parseSolutionText(fen, sol) : sol, explanation: null,
    difficulty: { value: 6, source: "estimate" },
    verification: { status: "verified", fenConfidence: 1, fenLegal: true, solutionLegal: true, engine: null, flags: [] },
    synthetic: true, ...over,
  };
}
export const BACK_RANK = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";
export const SMOTHER = "5r1k/6pp/7N/8/8/1Q6/8/7K w - - 0 1";
export const LADDER = "6k1/8/R7/1R6/8/8/8/K7 w - - 0 1";

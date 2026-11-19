import { Chess, validateFen } from "chess.js";
import type { Exercise, ExerciseDb, SolNode } from "./types";

export const SCHEMA = "chess-school-trainer/exercises@1";

export function solutionErrors(fen: string, nodes: SolNode[], path = ""): string[] {
  const errs: string[] = [];
  for (const n of nodes) {
    const chess = new Chess(fen);
    try {
      const mv = chess.move({ from: n.uci.slice(0, 2), to: n.uci.slice(2, 4), promotion: n.uci[4] });
      errs.push(...solutionErrors(chess.fen(), n.children, `${path}${mv.san} `));
    } catch { errs.push(`illegal move ${n.san || n.uci} after "${path.trim() || "start"}"`); }
  }
  return errs;
}

export function exerciseErrors(ex: Partial<Exercise>): string[] {
  const errs: string[] = [];
  if (!ex || typeof ex !== "object") return ["not an object"];
  if (!ex.id) errs.push("missing id");
  if (typeof ex.number !== "number") errs.push("missing exercise number");
  if (!ex.fen || !validateFen(ex.fen).ok) { errs.push(`invalid FEN: ${ex.fen ? validateFen(ex.fen).error : "missing"}`); return errs; }
  try { new Chess(ex.fen); } catch (e) { errs.push(`unplayable FEN: ${(e as Error).message}`); return errs; }
  const turn = ex.fen.split(" ")[1] === "w" ? "white" : "black";
  if (ex.sideToMove && ex.sideToMove !== turn) errs.push("sideToMove disagrees with FEN");
  if (!Array.isArray(ex.solution)) errs.push("missing solution tree");
  else errs.push(...solutionErrors(ex.fen, ex.solution));
  return errs;
}

export interface ImportResult {
  db?: ExerciseDb; accepted: Exercise[]; rejected: { id: string; errors: string[] }[]; error?: string;
}

/** Re-validate an exercise database before it enters the library. Nothing is
 *  trusted from the file: illegal positions/solutions are rejected and listed. */
export function validateDb(raw: unknown): ImportResult {
  const out: ImportResult = { accepted: [], rejected: [] };
  const db = raw as ExerciseDb;
  if (!db || typeof db !== "object" || db.schema !== SCHEMA) return { ...out, error: `Not an exercise database (expected schema "${SCHEMA}").` };
  if (!db.book?.id || !Array.isArray(db.exercises)) return { ...out, error: "Database is missing its book record or exercise list." };
  const seen = new Set<string>();
  for (const ex of db.exercises) {
    const errors = exerciseErrors(ex);
    if (ex?.id && seen.has(ex.id)) errors.push("duplicate id");
    // The pipeline already sent this one to manual review: keep it so it can be
    // repaired in the editor, but never let it into training as it stands.
    const repairable = errors.length > 0 && ex?.id && typeof ex.number === "number" && !seen.has(ex.id) && ex.verification?.status === "needs_review";
    if (repairable) {
      seen.add(ex.id);
      out.accepted.push({ ...ex, solution: [], verification: { ...ex.verification, status: "needs_review", flags: [...ex.verification.flags, "failed_import_validation"] } });
      continue;
    }
    if (errors.length) { out.rejected.push({ id: ex?.id ?? "?", errors }); continue; }
    seen.add(ex.id);
    const v = ex.verification ?? { status: "needs_review", fenConfidence: 0, fenLegal: true, solutionLegal: false, engine: null, flags: ["no_verification_record"] };
    // an exercise without a solution can never be "verified"
    const status = ex.solution.length && v.status === "verified" ? "verified" : "needs_review";
    out.accepted.push({ ...ex, synthetic: ex.synthetic || db.synthetic || undefined, verification: { ...v, status } });
  }
  out.db = db;
  return out;
}

export const isTrainable = (ex: Exercise) => ex.verification.status === "verified" && ex.solution.length > 0;

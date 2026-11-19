export interface SolNode { san: string; uci: string; children: SolNode[] }

export type EngineCheck = {
  verdict: "agrees" | "suspicious"; depth: number; engineBestMove: string | null;
  engineBestEval: string; bookMoveEval: string; note?: string;
} | null;

export interface Exercise {
  id: string;
  bookId: string;
  chapter: { id: string; title: string };
  number: number;
  numberSource?: string;
  pdfPage: number;
  printedPage?: number;
  fen: string;
  sideToMove: "white" | "black";
  sideSource?: string;
  instruction: string;
  instructionSource?: string;
  goal?: string | null;
  solutionRaw: string;
  solution: SolNode[];
  explanation: string | null;
  difficulty: { value: number; source: "estimate" | "book"; basis?: string };
  verification: {
    status: "verified" | "needs_review";
    fenConfidence: number;
    fenLegal: boolean;
    solutionLegal: boolean;
    mateConfirmed?: boolean | null;
    parseError?: string;
    engine: EngineCheck;
    flags: string[];
    reviewedBy?: "user";
  };
  diagram?: string;
  synthetic?: boolean;
}

export interface BookMeta { id: string; title: string; author: string; edition: string }

export interface PieceCluster {
  id: string; dark: boolean; count: number; label: string | null;
  confidence: number; source: string; confirmed: boolean; image: string;
}

export interface ExerciseDb {
  schema: string;
  book: BookMeta;
  generatedAt: string;
  synthetic?: boolean;
  exercises: Exercise[];
  report?: Record<string, unknown>;
  pieceClusters?: PieceCluster[];
}

export type Mode = "flow" | "deep" | "review" | "focus";
export type Result = "solved" | "assisted" | "failed";

export type Category =
  | "missed_candidate" | "visualization" | "missed_defence"
  | "evaluation" | "calculation" | "time_management";

export interface DeepRecord {
  plannedMinutes: number;
  candidates: string;
  lines: string;
  evaluation: "" | "winning" | "better" | "equal" | "worse" | "unclear";
  finalAnswer: string;
}

export interface Finding { category: Category; basis: "evidence" | "self-reported" | "weak"; reason: string }

export interface Attempt {
  exerciseId: string;
  ts: number;
  mode: Mode;
  result: Result;
  timeMs: number;
  wrongMoves: string[];
  offBookMoves: string[];
  hintLevel: number;
  /** played to the end of the line without the solution being shown */
  finished?: boolean;
  deep?: DeepRecord;
  selfReport?: Category[];
  findings?: Finding[];
}

export interface Srs { due: number; intervalDays: number; lapses: number }

export interface ProgressState {
  version: 1;
  attempts: Attempt[];
  srs: Record<string, Srs>;
}

// Thin UCI wrapper around the Stockfish WASM worker served from /public.
export interface Score { cp?: number; mate?: number }
export interface EvalResult { score: Score; best: string }

/** Comparable value from the mover's point of view. */
export const scoreValue = (s: Score) =>
  s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp ?? 0;

export const formatScore = (s: Score) =>
  s.mate !== undefined ? `${s.mate > 0 ? "" : "-"}M${Math.abs(s.mate)}` : `${(s.cp ?? 0) >= 0 ? "+" : ""}${((s.cp ?? 0) / 100).toFixed(1)}`;

export type AltVerdict = "equivalent" | "winning" | "inferior";

/** Judge a legal move that differs from the book's, using engine scores for
 *  both moves from the same position (solver's point of view). */
export function classifyAlternative(book: Score, alt: Score): AltVerdict {
  if (alt.mate !== undefined && alt.mate > 0) return "equivalent";
  const b = scoreValue(book), a = scoreValue(alt);
  if (a >= b - 80) return "equivalent";
  if (a >= 300) return "winning";
  return "inferior";
}

let worker: Worker | null = null;
let chain: Promise<unknown> = Promise.resolve();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/stockfish/stockfish-19-lite-single.js");
    worker.postMessage("uci");
  }
  return worker;
}

function run(fen: string, depth: number, searchMove?: string, timeoutMs = 15000): Promise<EvalResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    let score: Score | undefined;
    const cleanup = () => { clearTimeout(timer); w.removeEventListener("message", onMsg); w.removeEventListener("error", onError); };
    const fail = (message: string) => {
      cleanup();
      // A timed-out worker may still emit bestmove. Discard it so that reply
      // cannot resolve the next position's request in the queue.
      w.terminate(); if (worker === w) worker = null;
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail("engine timeout"), timeoutMs);
    const onError = () => fail("engine failed to load");
    const onMsg = (e: MessageEvent) => {
      const line = String(e.data);
      if (line.startsWith("info") && line.includes(" score ")) {
        const m = line.match(/score (cp|mate) (-?\d+)/);
        if (m && !/ (upper|lower)bound/.test(line)) score = m[1] === "cp" ? { cp: +m[2] } : { mate: +m[2] };
      } else if (line.startsWith("bestmove")) {
        const best = line.split(" ")[1];
        if (!score || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best)) { fail("engine returned no usable evaluation"); return; }
        cleanup(); resolve({ score, best });
      }
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onError);
    w.postMessage(`position fen ${fen}`);
    w.postMessage(`go depth ${depth}${searchMove ? ` searchmoves ${searchMove}` : ""}`);
  });
}

export function evaluate(fen: string, depth = 14, searchMove?: string): Promise<EvalResult> {
  const next = chain.then(() => run(fen, depth, searchMove), () => run(fen, depth, searchMove));
  chain = next.catch(() => undefined);
  return next;
}

export async function judgeAlternative(fen: string, bookUci: string, altUci: string, depth = 14) {
  const book = await evaluate(fen, depth, bookUci);
  const alt = await evaluate(fen, depth, altUci);
  return { verdict: classifyAlternative(book.score, alt.score), book: book.score, alt: alt.score };
}

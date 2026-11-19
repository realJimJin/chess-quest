import { Chess } from "chess.js";
import type { Attempt, Category, Exercise, Finding } from "./types";
import { mainline } from "./puzzle";

export const CATEGORY_INFO: Record<Category, { label: string; drill: string }> = {
  missed_candidate: { label: "Missing critical candidate moves", drill: "Before calculating anything, write every check, capture and threat — including the 'impossible' ones. Use Deep Calculation and fill the candidates box first." },
  visualization: { label: "Inaccurate visualization", drill: "Solve from the diagram without moving pieces, then say where every piece stands at the end of your line. Longer Deep Calculation sessions on lower stages." },
  missed_defence: { label: "Overlooking defensive resources", drill: "For each of your moves, name the opponent's two most stubborn replies before going on. Write them into your variations." },
  evaluation: { label: "Incorrect evaluation", drill: "End every line with a verdict and a reason (material, king safety, forced mate). Compare your verdict with the solution each time." },
  calculation: { label: "Calculation errors", drill: "Calculate the main line twice, the second time move by move, before committing. Prefer fewer exercises with full written lines." },
  time_management: { label: "Rushing / poor time management", drill: "Use the full planned thinking time on Stage 8+ positions. No move until the timer says so or the line is written to the end." },
};

const sanKey = (s: string) => s.replace(/[+#!?x]/g, "").replace(/=/g, "");
const sanTokens = (t: string) => t.match(/O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?/g) ?? [];

/** Replay a written line; returns SANs played and the first illegal token, if any. */
export function replayLine(fen: string, line: string): { sans: string[]; illegal?: string } {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const tok of sanTokens(line.replace(/\b0-0-0\b/g, "O-O-O").replace(/\b0-0\b/g, "O-O"))) {
    try { sans.push(chess.move(tok, { strict: false }).san); } catch { return { sans, illegal: tok }; }
  }
  return { sans };
}

export interface Diagnosis { findings: Finding[]; insufficient: boolean; note: string }

/** Diagnose a non-clean attempt from what was actually recorded. A wrong move
 *  by itself is not treated as evidence of any particular thinking error. */
export function diagnose(ex: Exercise, a: Pick<Attempt, "result" | "timeMs" | "deep" | "selfReport" | "wrongMoves" | "mode">): Diagnosis {
  const findings: Finding[] = [];
  const add = (category: Category, basis: Finding["basis"], reason: string) => {
    if (!findings.some((f) => f.category === category && f.basis === basis)) findings.push({ category, basis, reason });
  };
  const book = mainline(ex.solution).map((n) => n.san);
  const first = book[0] ? sanKey(book[0]) : "";
  const d = a.deep;
  const missed = a.result !== "solved";

  if (d && first) {
    const cands = sanTokens(d.candidates).map(sanKey);
    const answer = sanTokens(d.finalAnswer).map(sanKey)[0];
    const answerRight = answer === first;
    if (missed && cands.length > 0 && !cands.includes(first))
      add("missed_candidate", "evidence", `The key move ${book[0]} is not in your candidate list (${cands.length} listed).`);
    const lines = d.lines.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const r = replayLine(ex.fen, line);
      if (r.illegal) { add("visualization", "evidence", `Your line "${line}" has an illegal move (${r.illegal}) after ${r.sans.length} moves — the position in your head had drifted from the board.`); continue; }
      const keys = r.sans.map(sanKey);
      if (keys[0] !== first) continue;
      const bk = book.map(sanKey);
      let i = 1;
      while (i < keys.length && i < bk.length && keys[i] === bk[i]) i++;
      if (i < keys.length && i < bk.length) {
        if (i % 2 === 1) { if (missed) add("missed_defence", "evidence", `After ${book.slice(0, i).join(" ")}, the book's main defence is ${book[i]}; your line only considers ${r.sans[i]}.`); }
        else if (missed) add("calculation", "evidence", `Your line follows the solution to ${book.slice(0, i).join(" ")} and then goes ${r.sans[i]} where the book plays ${book[i]}.`);
      } else if (missed && keys.length < bk.length) add("calculation", "weak", `Your line stops after ${keys.length} moves; the solution runs ${bk.length}.`);
    }
    if (d.evaluation) {
      if (answerRight && ["equal", "worse", "unclear"].includes(d.evaluation))
        add("evaluation", "evidence", `You chose the right move but judged the result "${d.evaluation}".`);
      if (!answerRight && d.evaluation === "winning")
        add("evaluation", "evidence", `You judged your line "winning", but it was not the solution.`);
    }
    if (missed && d.plannedMinutes > 0 && a.timeMs < d.plannedMinutes * 60000 * 0.25)
      add("time_management", "evidence", `You answered after ${Math.round(a.timeMs / 1000)}s of a planned ${d.plannedMinutes} minutes.`);
  } else if (missed && a.wrongMoves.length && a.timeMs < 15000 && ex.difficulty.value >= 6) {
    add("time_management", "weak", `First move played ${Math.round(a.timeMs / 1000)}s into a higher-stage position.`);
  }
  for (const c of a.selfReport ?? []) add(c, "self-reported", "You tagged this yourself.");

  const insufficient = missed && findings.length === 0;
  return {
    findings, insufficient,
    note: insufficient
      ? "A wrong move alone doesn't show why it happened. Tag what went wrong below, or solve in Deep Calculation and write your lines — then this becomes specific."
      : findings.some((f) => f.basis === "evidence") ? "Based on the candidates, lines and timing you recorded." : "Based on your own tags and timing only.",
  };
}

/** Priorities for the dashboard. Thresholds are simple heuristics, not a rating model. */
export function recommendations(cat: Record<Category, { evidence: number; self: number; weak: number }>, extra: { firstTryAccuracy: number | null; attempted: number; deepShare: number; unexplained: number }) {
  const out: { title: string; detail: string }[] = [];
  const ranked = (Object.keys(cat) as Category[])
    .map((c) => ({ c, score: cat[c].evidence * 2 + cat[c].self * 1.5 + cat[c].weak * 0.5 }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  for (const { c } of ranked.slice(0, 3)) out.push({ title: CATEGORY_INFO[c].label, detail: CATEGORY_INFO[c].drill });
  if (extra.attempted >= 10 && extra.deepShare < 0.2)
    out.push({ title: "Too little slow calculation", detail: "Under 20% of your training time is Deep Calculation. Fast pattern speed is already your strength; classical results depend on long, verified lines." });
  if (extra.unexplained >= 5)
    out.push({ title: "Mistakes without a recorded cause", detail: `${extra.unexplained} misses have no notes or tags, so nothing can be learned from them. Tag each miss, or write lines in Deep Calculation.` });
  if (extra.firstTryAccuracy !== null && extra.attempted >= 20 && extra.firstTryAccuracy > 0.9)
    out.push({ title: "Material is too easy", detail: "First-try accuracy above 90%: move to a later stage or longer thinking times." });
  return out;
}

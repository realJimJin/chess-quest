"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import Board from "./Board";
import { useApp } from "@/lib/store";
import { bookTitle } from "@/lib/books";
import { createPuzzle, formatSolution, mainline, tryMove, type MoveInput, type Puzzle } from "@/lib/puzzle";
import { formatScore, judgeAlternative } from "@/lib/engine";
import { buildHints } from "@/lib/hints";
import { CATEGORY_INFO, diagnose } from "@/lib/diagnostics";
import { CATEGORIES } from "@/lib/progress";
import { xpFor } from "@/lib/game";
import type { Category, DeepRecord, Exercise, Mode, Result } from "@/lib/types";

type Tone = "good" | "bad" | "info" | "warn";
const TONE: Record<Tone, string> = { good: "border-good/40 bg-good/10 text-good", bad: "border-bad/40 bg-bad/10 text-bad", info: "border-line bg-panel2 text-ink", warn: "border-warn/40 bg-warn/10 text-warn" };
const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

interface Props { ex: Exercise; mode: Mode; position: string; onNext: () => void; autoAdvance: boolean; sessionStart: number; showSessionTimer: boolean }

export default function Runner({ ex, mode, position, onNext, autoAdvance, sessionStart, showSessionTimer }: Props) {
  const { addAttempt, amendAttempt } = useApp();
  const solver = ex.sideToMove;
  const deep = mode === "deep";
  const minimal = mode === "focus";
  const [puzzle, setPuzzle] = useState<Puzzle>(() => createPuzzle(ex.fen, ex.solution));
  const [view, setView] = useState<{ fen: string; last: [string, string] | null }>({ fen: ex.fen, last: null });
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [flip, setFlip] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: Tone; text: string } | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tags, setTags] = useState<Category[]>([]);
  const [xp, setXp] = useState(0);
  // deep calculation
  const [phase, setPhase] = useState<"setup" | "think" | "play">(deep ? "setup" : "play");
  const [planned, setPlanned] = useState(10);
  const [rec, setRec] = useState<DeepRecord>({ plannedMinutes: 10, candidates: "", lines: "", evaluation: "", finalAnswer: "" });
  const [answerErr, setAnswerErr] = useState("");

  const start = useRef(Date.now());
  const thinkMs = useRef<number | null>(null);
  const wrong = useRef<string[]>([]);
  const offBook = useRef<string[]>([]);
  const revealed = useRef(false);
  const usedHint = useRef(0);
  const attemptTs = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 500); return () => { window.clearInterval(t); timers.current.forEach(window.clearTimeout); }; }, []);

  const hints = useMemo(() => {
    if (puzzle.done || !puzzle.options.length) return [];
    let remaining = 0;
    for (let n = puzzle.options; n.length; n = n[0].children[0]?.children ?? []) remaining++;
    return buildHints(puzzle.fen, puzzle.options[0], remaining);
  }, [puzzle]);

  const finish = useCallback((res: Result, deepRec?: DeepRecord) => {
    if (attemptTs.current !== null) return;
    const ts = Date.now();
    attemptTs.current = ts;
    const timeMs = thinkMs.current ?? ts - start.current;
    const base = { exerciseId: ex.id, ts, mode, result: res, timeMs, wrongMoves: wrong.current, offBookMoves: offBook.current, hintLevel: usedHint.current, finished: !revealed.current, deep: deepRec };
    addAttempt({ ...base, findings: res === "solved" ? [] : diagnose(ex, base).findings });
    setXp(xpFor(base, ex.difficulty.value, mode === "review"));
    setResult(res);
    setView((v) => ({ ...v }));
  }, [addAttempt, ex, mode]);

  const grade = useCallback((): Result => (revealed.current || wrong.current.length ? "failed" : usedHint.current > 0 ? "assisted" : "solved"), []);

  const handleMove = useCallback((input: MoveInput, fromAnswerBox = false) => {
    if (busy || result) return;
    const out = tryMove(puzzle, input);
    if (out.kind === "illegal") { setResetKey((k) => k + 1); return; }
    const deepRec = deep ? { ...rec, plannedMinutes: planned } : undefined;
    if (out.kind === "mate") {
      const isBook = puzzle.options.some((n) => n.san === out.san);
      setPuzzle(out.puzzle); setView({ fen: out.puzzle.fen, last: [input.from, input.to] });
      setFeedback({ tone: "good", text: isBook ? "Checkmate." : `${out.san} is checkmate too — a different finish from the book's, and just as good.` });
      finish(grade(), deepRec);
      return;
    }
    if (out.kind === "book") {
      const mid = new Chess(puzzle.fen);
      mid.move({ from: input.from, to: input.to, promotion: input.promotion });
      setView({ fen: mid.fen(), last: [input.from, input.to] });
      setPuzzle(out.puzzle);
      setHintLevel(0); // hints restart for the next move; usedHint keeps the grade honest
      if (out.reply) {
        setBusy(true);
        setFeedback({ tone: "good", text: out.puzzle.done ? `${out.san} — and ${out.reply.san} ends the book's line.` : `${out.san} is right. Keep going.` });
        timers.current.push(window.setTimeout(() => {
          setView({ fen: out.puzzle.fen, last: [out.reply!.uci.slice(0, 2), out.reply!.uci.slice(2, 4)] });
          setBusy(false);
          if (out.puzzle.done) finish(grade(), deepRec);
        }, 420));
      } else {
        setFeedback({ tone: "good", text: `${out.san} — solved.` });
        finish(grade(), deepRec);
      }
      return;
    }
    // legal, but not the book move: let the engine judge rather than calling it wrong
    const bookNode = puzzle.options[0];
    setBusy(true);
    setView({ fen: out.fenAfter, last: [input.from, input.to] });
    setFeedback({ tone: "info", text: `${out.san} isn't the book's move. Checking it with the engine…` });
    const back = () => { setView({ fen: puzzle.fen, last: null }); setResetKey((k) => k + 1); setBusy(false); };
    judgeAlternative(puzzle.fen, bookNode.uci, out.uci).then((j) => {
      const scores = `engine: ${out.san} ${formatScore(j.alt)}, book move ${formatScore(j.book)}`;
      if (j.verdict === "equivalent") {
        offBook.current = [...offBook.current, out.san];
        setFeedback({ tone: "good", text: `${out.san} is as strong as the book's move (${scores}). Counted as correct; the book's own line is shown below.` });
        setBusy(false);
        finish(grade(), deepRec);
      } else if (j.verdict === "winning") {
        offBook.current = [...offBook.current, out.san];
        setFeedback({ tone: "warn", text: `${out.san} also wins, but there is something stronger (${scores}). Not counted as a mistake — look for the most forcing line.` });
        timers.current.push(window.setTimeout(back, 900));
        if (fromAnswerBox) setPhase("play");
      } else {
        wrong.current = [...wrong.current, out.san];
        if (deep && fromAnswerBox) {
          revealed.current = true;
          setFeedback({ tone: "bad", text: `${out.san} doesn't hold up (${scores}). Compare your lines with the solution below.` });
          timers.current.push(window.setTimeout(() => { back(); finish("failed", deepRec); }, 900));
        } else {
          setFeedback({ tone: "bad", text: `${out.san} doesn't hold up (${scores}). Take it back and look again — a hint is available.` });
          timers.current.push(window.setTimeout(back, 900));
        }
      }
    }).catch(() => {
      offBook.current = [...offBook.current, out.san];
      setFeedback({ tone: "warn", text: `${out.san} isn't the book's move. The engine couldn't be loaded, so it can't be judged — not counted as a mistake. Try another idea or ask for a hint.` });
      timers.current.push(window.setTimeout(back, 900));
      if (fromAnswerBox) setPhase("play");
    });
  }, [busy, result, puzzle, deep, rec, planned, finish, grade]);

  const showHint = () => {
    if (!hints.length || result) return;
    const lvl = Math.min(hintLevel + 1, hints.length);
    setHintLevel(lvl);
    usedHint.current = Math.max(usedHint.current, lvl);
    const h = hints[lvl - 1];
    if (h.reveals) revealed.current = true;
    setFeedback({ tone: "info", text: `Hint ${lvl}/${hints.length}: ${h.text}` });
  };
  const giveUp = () => { if (result) return; revealed.current = true; finish("failed", deep ? { ...rec, plannedMinutes: planned } : undefined); setFeedback({ tone: "bad", text: "Solution shown. This one goes into your review queue." }); };

  const commitAnswer = () => {
    setAnswerErr("");
    const chess = new Chess(ex.fen);
    let mv;
    try { mv = chess.move(rec.finalAnswer.trim().replace(/^\d+\.+\s*/, ""), { strict: false }); }
    catch { setAnswerErr("That isn't a legal move in this position. Use notation like Qxh7+ or Rd8."); return; }
    thinkMs.current = Date.now() - start.current;
    setPhase("play");
    handleMove({ from: mv.from, to: mv.to, promotion: mv.promotion }, true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (result && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight" || e.key === "n")) { e.preventDefault(); onNext(); }
      else if (!result && e.key === "h" && phase === "play") showHint();
      else if (e.key === "f") setFlip((f) => !f);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    // an accepted alternative stays on screen so the book's own line can be read
    if (result === "solved" && autoAdvance && !deep && offBook.current.length === 0) { const t = window.setTimeout(onNext, 1300); return () => window.clearTimeout(t); }
  }, [result, autoAdvance, deep, onNext]);

  const toggleTag = (c: Category) => {
    const next = tags.includes(c) ? tags.filter((x) => x !== c) : [...tags, c];
    setTags(next);
    if (attemptTs.current !== null && result) {
      const base = { result, timeMs: thinkMs.current ?? 0, deep: deep ? rec : undefined, selfReport: next, wrongMoves: wrong.current, mode };
      amendAttempt(ex.id, attemptTs.current, { selfReport: next, findings: diagnose(ex, base).findings });
    }
  };

  const dx = result && result !== "solved"
    ? diagnose(ex, { result, timeMs: thinkMs.current ?? (attemptTs.current ?? now) - start.current, deep: deep ? { ...rec, plannedMinutes: planned } : undefined, selfReport: tags, wrongMoves: wrong.current, mode })
    : null;
  const elapsed = (result && attemptTs.current ? attemptTs.current : now) - start.current;
  const remaining = planned * 60000 - elapsed;
  const hintSquares = !result && hintLevel >= 3 && hints[hintLevel - 1] ? hints[hintLevel - 1].squares : undefined;
  const orientation = (solver === "white") !== flip ? "white" : "black";
  const interactive = !result && !busy && phase === "play";
  const eng = ex.verification.engine;

  return (
    <div className={`training-layout grid gap-5 ${minimal ? "mx-auto max-w-[min(72vh,720px)]" : "lg:grid-cols-[minmax(0,1fr)_380px]"}`}>
      <div className={minimal ? "" : "mx-auto w-full max-w-[min(74vh,640px)]"}>
        <div className="mb-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full border border-line ${solver === "white" ? "bg-white" : "bg-black"}`} />
            <span className="font-medium" data-testid="instruction">{ex.instruction}</span>
            {ex.goal && <span className="rounded bg-panel2 px-1.5 py-0.5 text-xs text-mute">{ex.goal}</span>}
            <span className="text-mute">· № {ex.number}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-mute">
            {showSessionTimer && <span title="Session time">Σ {fmt(now - sessionStart)}</span>}
            <span data-testid="clock">{deep && phase === "think" ? fmt(remaining) : fmt(elapsed)}</span>
            <span>{position}</span>
          </div>
        </div>
        <Board fen={view.fen} orientation={orientation} interactive={interactive} onMove={handleMove} lastMove={view.last} highlights={hintSquares} resetKey={resetKey} />
        {minimal && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className={`min-h-9 flex-1 rounded-lg border px-3 py-1.5 text-sm ${feedback ? TONE[feedback.tone] : "border-transparent text-mute"}`} data-testid="feedback" role="status" aria-live="polite">{feedback?.text ?? ""}</div>
            {!result ? <><button className="btn btn-ghost" onClick={showHint}>Hint</button><button className="btn btn-ghost" onClick={giveUp}>Solution</button></>
              : <button className="btn btn-primary" data-testid="next" onClick={onNext} autoFocus>Next →</button>}
          </div>
        )}
        {minimal && result && <p className="mt-2 font-mono text-sm text-mute" data-testid="solution">{formatSolution(ex.fen, ex.solution)}</p>}
      </div>

      {!minimal && (
        <aside className="flex flex-col gap-3">
          <div className="card p-4">
            <div className="label">{bookTitle(ex.bookId)} · {ex.chapter.title}</div>
            <div className="mt-1 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Exercise {ex.number}</h2>
              <span className="text-xs text-mute">{(ex.printedPage ?? ex.pdfPage) > 0 ? `p. ${ex.printedPage ?? ex.pdfPage} · ` : ""}difficulty {ex.difficulty.value}/10 <span title={ex.difficulty.basis}>({ex.difficulty.source})</span></span>
            </div>
            {ex.synthetic && <p className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">Sample puzzle — original, not from any book.</p>}
          </div>

          {deep && phase === "setup" && !result && (
            <div className="card p-4">
              <div className="label">Deep calculation</div>
              <p className="mt-2 text-sm text-mute">The board is locked. Calculate in your head, write your lines, then commit one answer.</p>
              <div className="mt-3 flex gap-2">
                {[5, 10, 20, 30].map((m) => <button key={m} className="chip" data-on={planned === m} onClick={() => setPlanned(m)}>{m} min</button>)}
              </div>
              <button className="btn btn-primary mt-4 w-full" data-testid="deep-start" onClick={() => { start.current = Date.now(); setPhase("think"); }}>Start thinking</button>
            </div>
          )}
          {deep && phase === "think" && !result && (
            <div className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between"><span className="label">Thinking time</span>
                <span className={`font-mono text-lg ${remaining < 0 ? "text-warn" : ""}`}>{fmt(Math.abs(remaining))}{remaining < 0 ? " over" : ""}</span></div>
              <label className="block"><span className="label">Candidate moves</span>
                <input className="field mt-1" data-testid="deep-candidates" placeholder="Qxh7+, Rd8, Nf6+" value={rec.candidates} onChange={(e) => setRec({ ...rec, candidates: e.target.value })} /></label>
              <label className="block"><span className="label">Principal variations — one per line</span>
                <textarea className="field mt-1 h-28 font-mono" data-testid="deep-lines" placeholder={"1.Qxh7+ Kxh7 2.Rh3+ Kg8 3.Rh8#"} value={rec.lines} onChange={(e) => setRec({ ...rec, lines: e.target.value })} /></label>
              <label className="block"><span className="label">Your evaluation</span>
                <select className="field mt-1" data-testid="deep-eval" value={rec.evaluation} onChange={(e) => setRec({ ...rec, evaluation: e.target.value as DeepRecord["evaluation"] })}>
                  <option value="">—</option><option value="winning">Winning</option><option value="better">Clearly better</option><option value="equal">Equal</option><option value="worse">Worse</option><option value="unclear">Unclear</option>
                </select></label>
              <label className="block"><span className="label">Final answer — first move</span>
                <input className="field mt-1 font-mono" data-testid="deep-answer" placeholder="Qxh7+" value={rec.finalAnswer} onChange={(e) => setRec({ ...rec, finalAnswer: e.target.value })} onKeyDown={(e) => e.key === "Enter" && commitAnswer()} /></label>
              {answerErr && <p className="text-xs text-bad" role="alert">{answerErr}</p>}
              {remaining > planned * 60000 * 0.5 && rec.finalAnswer && <p className="text-xs text-mute">More than half your time is left. Check the opponent&apos;s best defence once more?</p>}
              <button className="btn btn-primary" data-testid="deep-commit" disabled={!rec.finalAnswer.trim()} onClick={commitAnswer}>Commit answer</button>
            </div>
          )}

          {feedback && <div className={`rounded-xl border px-4 py-3 text-sm ${TONE[feedback.tone]}`} data-testid="feedback" role="status" aria-live="polite">{feedback.text}</div>}

          {!result && phase === "play" && (
            <div className="card flex items-center gap-2 p-3">
              <button className="btn flex-1" data-testid="hint" onClick={showHint} disabled={!hints.length || hintLevel >= hints.length}>Hint {hintLevel ? `${hintLevel}/${hints.length}` : ""}</button>
              <button className="btn flex-1" data-testid="giveup" onClick={giveUp}>Show solution</button>
              <button className="btn" onClick={() => setFlip(!flip)} title="Flip board (f)" aria-label="Flip board">⇅</button>
            </div>
          )}

          {result && (
            <div className="card flex flex-col gap-3 p-4" data-testid="result" data-result={result}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${result === "solved" ? "text-good" : result === "assisted" ? "text-warn" : "text-bad"}`}>
                  {result === "solved" ? "Solved" : result === "assisted" ? "Solved with hints" : revealed.current ? "Missed — queued for review" : "Finished after a miss — counted, and queued for review"}</span>
                <span className="flex items-center gap-2"><span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent" data-testid="xp">+{xp} XP</span><span className="font-mono text-xs text-mute">{fmt(thinkMs.current ?? elapsed)}</span></span>
              </div>
              <div><div className="label">Book solution</div>
                <p className="mt-1 font-mono text-sm leading-relaxed" data-testid="solution">{formatSolution(ex.fen, ex.solution)}</p>
                {ex.explanation && <p className="mt-2 text-sm text-mute">{ex.explanation}</p>}</div>
              {eng?.verdict === "suspicious" && (
                <p className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">Engine cross-check disagrees with the book here: it prefers {eng.engineBestMove} ({eng.engineBestEval}) over the book move ({eng.bookMoveEval}). The stored solution is still the book&apos;s.</p>)}
              {dx && (
                <div className="border-t border-line pt-3">
                  <div className="label">What went wrong</div>
                  <p className="mt-1 text-xs text-mute">{dx.note}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {dx.findings.map((f, i) => (
                      <li key={i} className="text-sm"><span className="font-medium">{CATEGORY_INFO[f.category].label}</span>
                        <span className="ml-1.5 rounded bg-panel2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-mute">{f.basis}</span>
                        <div className="text-xs text-mute">{f.reason}</div></li>))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => <button key={c} className="chip" data-on={tags.includes(c)} data-testid={`tag-${c}`} onClick={() => toggleTag(c)}>{CATEGORY_INFO[c].label}</button>)}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-mute" data-testid="saved-note">✓ Saved to this browser{revealed.current ? "" : " · counts on your map"}</p>
              <div className="flex gap-2">
                <button className="btn btn-primary flex-1" data-testid="next" onClick={onNext} autoFocus>Next exercise →</button>
                <Link className="btn" href={`/partner?id=${encodeURIComponent(ex.id)}`}>Discuss</Link>
              </div>
              <p className="text-center text-[11px] text-mute">Enter / Space for next · f flips the board</p>
            </div>
          )}
          {!result && phase === "play" && <p className="px-1 text-[11px] text-mute">h for a hint · f flips the board. A legal move that differs from the book is checked by the engine before it is judged.</p>}
          {!result && mainline(ex.solution).length >= 5 && phase === "play" && !deep && <p className="px-1 text-[11px] text-mute">This is a long line. Deep Calculation mode suits it better than moving pieces.</p>}
        </aside>
      )}
    </div>
  );
}

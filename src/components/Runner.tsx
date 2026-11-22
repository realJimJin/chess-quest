"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import Board from "./Board";
import QuestIcon from "./QuestIcon";
import CalculationNotebook from "./training/CalculationNotebook";
import MoveEntry from "./training/MoveEntry";
import { parseNotation } from "./training/notation";
import styles from "./training/training.module.css";
import { useApp } from "@/lib/store";
import { bookTitle } from "@/lib/books";
import { createPuzzle, formatSolution, mainline, tryMove, type MoveInput, type Puzzle } from "@/lib/puzzle";
import { formatScore, judgeAlternative } from "@/lib/engine";
import { buildHints } from "@/lib/hints";
import { CATEGORY_INFO, diagnose } from "@/lib/diagnostics";
import { CATEGORIES } from "@/lib/progress";
import { xpFor } from "@/lib/game";
import type { Attempt, Category, DeepRecord, Exercise, Mode, Result } from "@/lib/types";

type Tone = "good" | "bad" | "info" | "warn";
const TONE: Record<Tone, string> = { good: "border-good/40 bg-good/10 text-good", bad: "border-bad/40 bg-bad/10 text-bad", info: "border-line bg-panel2 text-ink", warn: "border-warn/40 bg-warn/10 text-warn" };
const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

interface Props { ex: Exercise; mode: Mode; position: string; onNext: () => void; onRecorded: (attempt: Attempt) => void; autoAdvance: boolean; sessionStart: number; showSessionTimer: boolean; practice?: boolean; onRetry?: () => void }

export default function Runner({ ex, mode, position, onNext, onRecorded, autoAdvance, sessionStart, showSessionTimer, practice = false, onRetry }: Props) {
  const { addAttempt, amendAttempt, library } = useApp();
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
  const [recorded, setRecorded] = useState<Attempt | null>(null);
  const result = recorded?.result ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(now);
  const [tags, setTags] = useState<Category[]>([]);
  const [xp, setXp] = useState(0);
  // deep calculation
  const [phase, setPhase] = useState<"setup" | "think" | "play">(deep ? "setup" : "play");
  const [planned, setPlanned] = useState(10);
  const [rec, setRec] = useState<DeepRecord>({ plannedMinutes: 10, candidates: "", lines: "", evaluation: "", finalAnswer: "" });
  const [answerErr, setAnswerErr] = useState("");

  const start = useRef(now);
  const thinkMs = useRef<number | null>(null);
  const wrong = useRef<string[]>([]);
  const offBook = useRef<string[]>([]);
  const revealed = useRef(false);
  const usedHint = useRef(0);
  const attemptTs = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pendingTimers = timers.current;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => { window.clearInterval(t); pendingTimers.forEach(window.clearTimeout); };
  }, []);

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
    const attempt = { ...base, findings: res === "solved" ? [] : diagnose(ex, base).findings };
    // A retry keeps the first graded attempt, review schedule, and session total intact.
    if (!practice) { addAttempt(attempt); onRecorded(attempt); }
    setXp(practice ? 0 : xpFor(base, ex.difficulty.value, mode === "review"));
    setRecorded(attempt);
    setView((v) => ({ ...v }));
  }, [addAttempt, ex, mode, onRecorded, practice]);

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
    const move = parseNotation(ex.fen, rec.finalAnswer);
    if (!move) { setAnswerErr("That isn't a legal move in this position. Use notation like Nf3 or e2e4."); return; }
    thinkMs.current = Date.now() - start.current;
    setPhase("play");
    handleMove(move, true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t?.closest("input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])")) return;
      if (["Enter", " ", "ArrowRight"].includes(e.key) && t?.closest("button, a, [role='button']")) return;
      if (result && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight" || e.key === "n")) { e.preventDefault(); onNext(); }
      else if (result && result !== "solved" && e.key === "r" && onRetry) { e.preventDefault(); onRetry(); }
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
    if (attemptTs.current !== null && result && !practice) {
      const base = { result, timeMs: recorded?.timeMs ?? 0, deep: recorded?.deep, selfReport: next, wrongMoves: wrong.current, mode };
      amendAttempt(ex.id, attemptTs.current, { selfReport: next, findings: diagnose(ex, base).findings });
    }
  };

  const dx = recorded && result !== "solved"
    ? diagnose(ex, { ...recorded, selfReport: tags })
    : null;
  const elapsed = (recorded?.ts ?? now) - startedAt;
  const remaining = planned * 60000 - elapsed;
  const hintSquares = !result && hintLevel >= 3 && hints[hintLevel - 1] ? hints[hintLevel - 1].squares : undefined;
  const orientation = (solver === "white") !== flip ? "white" : "black";
  const interactive = !result && !busy && phase === "play";
  const eng = ex.verification.engine;
  const collectionTitle = ex.bookId === "samples" ? "The Starter Collection" : library[ex.bookId]?.book.title ?? bookTitle(ex.bookId);

  return (
    <div className={styles.layout} data-focus={minimal}>
      <div className={styles.boardColumn}>
        <div className={styles.boardTopline}>
          <div className={styles.instruction}>
            <span className={styles.pieceDot} data-side={solver} aria-hidden="true" />
            <span className="font-medium" data-testid="instruction">{ex.instruction}</span>
          </div>
          <div className={styles.clock}>
            {showSessionTimer && <span title="Session time">Σ {fmt(now - sessionStart)}</span>}
            <span data-testid="clock" aria-label="Exercise time">{fmt(elapsed)}</span>
            <span aria-label={`Exercise ${position.replace("/", " of ")}`}>{position}</span>
          </div>
        </div>
        <Board fen={view.fen} orientation={orientation} interactive={interactive} onMove={handleMove} lastMove={view.last} highlights={hintSquares} resetKey={resetKey} />
        <div className={styles.boardCaption}>
          <span>{deep && phase !== "play" ? "Board locked · calculate without moving the pieces" : busy ? "Checking your move…" : result ? "Exercise finished" : "Take your time. Accuracy comes first."}</span>
          <button onClick={() => setFlip(!flip)} title="Flip board (f)" aria-label="Flip board"><QuestIcon name="rotate" /> Flip board</button>
        </div>
        {!result && phase === "play" && <MoveEntry fen={puzzle.fen} disabled={!interactive} onMove={handleMove} />}
        {minimal && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className={`min-h-9 flex-1 rounded-lg border px-3 py-1.5 text-sm ${feedback ? TONE[feedback.tone] : "border-transparent text-mute"}`} data-testid="feedback" role="status" aria-live="polite">{feedback?.text ?? ""}</div>
            {!result ? <><button className="btn btn-ghost" onClick={showHint}>Hint</button><button className="btn btn-ghost" onClick={giveUp}>Solution</button></>
              : <>{result !== "solved" && onRetry && <button className="btn" data-testid="retry" onClick={onRetry}>Try again</button>}<button className="btn btn-primary" data-testid="next" onClick={onNext} autoFocus>Next →</button></>}
          </div>
        )}
        {minimal && result && <p className="mt-2 font-mono text-sm text-mute" data-testid="solution">{formatSolution(ex.fen, ex.solution)}</p>}
      </div>

      {!minimal && (
        <aside className={styles.sidebar}>
          <div className={styles.exerciseCard}>
            <span className="eyebrow">{deep ? "THE CALCULATION ROOM" : mode === "review" ? "ANOTHER LOOK" : "YOUR DAILY PRACTICE"}</span>
            <h2>Exercise {ex.number}</h2>
            <div className={styles.exerciseMeta}>
              <span title={ex.difficulty.basis}>Difficulty {ex.difficulty.value}/10 · {ex.difficulty.source === "estimate" ? "estimated" : "from the book"}</span>
              {(ex.printedPage ?? ex.pdfPage) > 0 && <span>Page {ex.printedPage ?? ex.pdfPage}</span>}
            </div>
            <div className={styles.exerciseSource}><strong>{collectionTitle}</strong>{ex.chapter.title}{ex.goal ? ` · ${ex.goal}` : ""}</div>
            {ex.synthetic && <p className={styles.originalNote}><QuestIcon name="shield" /> Original sample puzzle · not from a book</p>}
          </div>

          {deep && !result && <CalculationNotebook phase={phase} planned={planned} remaining={remaining} record={rec} error={answerErr}
            onPlan={setPlanned} onChange={value => { setRec(value); setAnswerErr(""); }} onStart={() => {
              const timestamp = Date.now(); start.current = timestamp; setStartedAt(timestamp); setNow(timestamp); setPhase("think");
            }} onCommit={commitAnswer} />}

          {feedback && <div className={styles.feedback} data-tone={feedback.tone} data-testid="feedback" role="status" aria-live="polite">{feedback.text}</div>}

          {!result && phase === "play" && (
            <div className={styles.actions}>
              <button className="btn flex-1" data-testid="hint" onClick={showHint} disabled={!hints.length || hintLevel >= hints.length}>Hint {hintLevel ? `${hintLevel}/${hints.length}` : ""}</button>
              <button className="btn flex-1" data-testid="giveup" onClick={giveUp}>Show solution</button>
            </div>
          )}

          {result && (
            <div className={styles.resultCard} data-testid="result" data-result={result}>
              <div className={styles.resultHeading}>
                <div><h3>{result === "solved" ? "Nicely calculated." : result === "assisted" ? "You found the way." : "A position to revisit."}</h3>
                  <p>{result === "solved" ? "Solved without hints" : result === "assisted" ? "Solved with hints" : recorded?.finished === false ? "Solution revealed · queued for review" : "Completed after a miss · queued for review"} · {fmt(recorded?.timeMs ?? elapsed)}</p></div>
                <span className={styles.xp} data-testid="xp">+{xp} XP</span>
              </div>
              <div className={styles.solution}><div className="label">{ex.synthetic ? "Original solution" : "Book solution"}</div>
                <p className="mt-1 font-mono text-sm leading-relaxed" data-testid="solution">{formatSolution(ex.fen, ex.solution)}</p>
                {ex.explanation && <p className="mt-2 text-sm text-mute">{ex.explanation}</p>}</div>
              {eng?.verdict === "suspicious" && (
                <p className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">Engine cross-check disagrees with the book here: it prefers {eng.engineBestMove} ({eng.engineBestEval}) over the book move ({eng.bookMoveEval}). The stored solution is still the book&apos;s.</p>)}
              {dx && (
                <div className={styles.reflection}>
                  <div className="label">Take a moment to reflect</div>
                  <p className="mt-1 text-xs text-mute">{dx.note}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {dx.findings.map((f, i) => (
                      <li key={i} className="text-sm"><span className="font-medium">{CATEGORY_INFO[f.category].label}</span>
                        <span className="ml-1.5 rounded bg-panel2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-mute">{f.basis}</span>
                        <div className="text-xs text-mute">{f.reason}</div></li>))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => <button key={c} className="chip" data-on={tags.includes(c)} aria-pressed={tags.includes(c)} data-testid={`tag-${c}`} onClick={() => toggleTag(c)}>{CATEGORY_INFO[c].label}</button>)}
                  </div>
                </div>
              )}
              <p className={styles.savedNote} data-testid="saved-note">{practice ? "Practice retry — your first attempt remains on record" : <>Recorded in your session{recorded?.finished === false ? "" : " · counts on your map"}</>}</p>
              <div className="flex flex-wrap gap-2">
                {result !== "solved" && onRetry && <button className="btn" data-testid="retry" onClick={onRetry}>Try again</button>}
                <button className="btn btn-primary flex-1" data-testid="next" onClick={onNext} autoFocus>Next exercise →</button>
                <Link className="btn" href={`/partner?id=${encodeURIComponent(ex.id)}`}>Discuss</Link>
              </div>
              <p className={styles.keyboardHelp}>Press <kbd>n</kbd> for the next exercise · <kbd>f</kbd> to flip the board</p>
            </div>
          )}
          {!result && phase === "play" && <p className={styles.keyboardHelp}><kbd>h</kbd> for a hint · <kbd>f</kbd> to flip. Legal alternatives to the stored solution are checked by the engine.</p>}
          {!result && mainline(ex.solution).length >= 5 && phase === "play" && !deep && <p className="px-1 text-[11px] text-mute">This is a long line. Deep Calculation mode suits it better than moving pieces.</p>}
        </aside>
      )}
    </div>
  );
}

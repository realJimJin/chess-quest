"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board from "../Board";
import QuestIcon from "../QuestIcon";
import { OPENING_DISCLAIMER, OPENING_LINES, type OpeningLine } from "@/lib/openings/catalog";
import { advanceOpponent, attemptOpeningMove, compileLine, isYourTurn, newSession, positionAt, sessionScore, revealOpeningMove, type OpeningSession } from "@/lib/openings/trainer";
import { localOpeningProgressStore, recordOpeningRun, type OpeningProgress, type OpeningProgressStore } from "@/lib/openings/progress";
import styles from "./openings.module.css";

export default function OpeningTrainer({ progressStore = localOpeningProgressStore }: { progressStore?: OpeningProgressStore }) {
  const [filter, setFilter] = useState<"all" | "white" | "black">("all");
  const [line, setLine] = useState<OpeningLine | null>(null);
  const [session, setSession] = useState<OpeningSession>(() => newSession("learn"));
  const [progress, setProgress] = useState<OpeningProgress | null>(null);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [moveText, setMoveText] = useState("");
  const [now, setNow] = useState(0);
  const recorded = useRef(false);
  const steps = useMemo(() => line ? compileLine(line) : [], [line]);
  const done = !!line && session.ply === steps.length;
  const yourTurn = !!line && isYourTurn(steps, line.side, session);
  const current = steps[session.ply];
  const revealed = session.mode === "learn" || session.assisted.includes(session.ply);
  const displayPly = done && reviewPly !== null ? reviewPly : session.ply;

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser-only storage after SSR, and reflect completed writes in the UI. */
  useEffect(() => {
    setNow(Date.now());
    try { setProgress(progressStore.load()); setError(null); }
    catch { setError("load"); }
  }, [progressStore]);

  useEffect(() => {
    if (!line || done || yourTurn) return;
    const timer = window.setTimeout(() => setSession(s => advanceOpponent(steps, line.side, s)), 420);
    return () => window.clearTimeout(timer);
  }, [line, done, yourTurn, steps, session.ply]);

  useEffect(() => {
    if (!done || !line || !progress || session.mode !== "recall" || recorded.current) return;
    recorded.current = true;
    const next = recordOpeningRun(progress, line, steps, session, Date.now());
    setProgress(next);
    try { progressStore.save(next); setError(null); }
    catch { setError("save"); }
  }, [done, line, progress, progressStore, session, steps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function start(selected: OpeningLine, mode: OpeningSession["mode"]) {
    recorded.current = false;
    setLine(selected); setSession(newSession(mode)); setReviewPly(null); setMoveText("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function closeLine() { setLine(null); setNow(Date.now()); window.scrollTo({ top: 0, behavior: "instant" }); }
  function retryStorage() {
    try {
      if (error === "load") setProgress(progressStore.load());
      else if (progress) progressStore.save(progress);
      setError(null);
    } catch { /* Keep the notice and the unsaved in-memory result. */ }
  }
  function playNotation() {
    if (!current || !line || !yourTurn) return;
    // The engine accepts coordinates; derive a legal SAN choice from this position.
    const normalized = moveText.trim().replace(/0/g, "O").replace(/[+#]$/, "");
    const legal = new Chess(current.fen).moves({ verbose: true });
    const match = legal.find(m => m.san.replace(/[+#]$/, "") === normalized || `${m.from}${m.to}${m.promotion ?? ""}` === normalized.toLowerCase());
    if (!match) { setSession(s => ({ ...s, feedback: "Enter a legal move, such as Nf3, O-O or e2e4." })); return; }
    setSession(s => attemptOpeningMove(steps, line.side, s, match)); setMoveText("");
  }

  const storageNotice = error && <div className={styles.notice} role="alert"><span>{error === "load" ? "Saved opening progress could not be read. You can practice; existing data will not be overwritten." : "This result is in memory but could not be saved on this device. Keep this screen open and retry."}</span><button onClick={retryStorage}>Retry saving progress</button></div>;

  if (!line) {
    const practiced = OPENING_LINES.filter(l => progress?.lines[l.id]).length;
    const due = OPENING_LINES.filter(l => progress?.lines[l.id] && progress.lines[l.id].reviewAt <= now);
    return <section className={styles.catalog} aria-labelledby="openings-title">
      <div className={styles.eyebrow}><QuestIcon name="knight" /> THE OPENING ROOM</div>
      <header className={styles.intro}><div><h1 id="openings-title">Your first moves.<br /><em>A clear plan.</em></h1><p>Learn the position. Close the notes. Play it from memory.</p></div><div className={styles.tally}><strong>{practiced}<span> / {OPENING_LINES.length}</span></strong><span>lines practiced</span></div></header>
      {storageNotice}
      <div className={styles.collectionHeading}><div><span className={styles.eyebrow}>REPERTOIRE STUDY 01</span><h2>Alisa Genrietta Yunker</h2><p>Eight recorded openings. White’s d4 center. Black’s Caro-Kann and Slav structures.</p></div><span className={styles.offline}>Offline · saved on this device</span></div>
      {due.length > 0 && <button className={styles.reviewBanner} onClick={() => start(due[0], "recall")}><span>{due.length} {due.length === 1 ? "line is" : "lines are"} ready for review</span><span>Practice now →</span></button>}
      <div className={styles.filters} aria-label="Filter openings">{(["all", "white", "black"] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All openings" : `Play as ${value === "white" ? "White" : "Black"}`}</button>)}</div>
      <div className={styles.lineGrid}>{OPENING_LINES.filter(l => filter === "all" || l.side === filter).map((l, i) => {
        const saved = progress?.lines[l.id];
        return <article className={styles.lineCard} key={l.id}>
          <div className={styles.cardTop}><span className={`${styles.sideDot} ${l.side === "white" ? styles.white : styles.black}`} /><span>PLAY AS {l.side.toUpperCase()}</span><span className={styles.lineNumber}>{String(i + 1).padStart(2, "0")}</span></div>
          <h3>{l.title}</h3><p>{l.subtitle}</p><div className={styles.movePreview}>{l.moves.slice(0, 6).map((m, p) => `${p % 2 === 0 ? `${p / 2 + 1}. ` : ""}${m}`).join(" ")}</div>
          <div className={styles.cardMeta}><span>{Math.ceil(l.moves.length / 2)} moves</span><span>{saved ? `${saved.accuracy}% last recall` : "Not practiced yet"}</span></div>
          <div className={styles.actions}><button className={styles.secondary} onClick={() => start(l, "learn")}>Learn line</button><button className={styles.primary} onClick={() => start(l, "recall")}>Practice <span aria-hidden>→</span></button></div>
        </article>;
      })}</div>
      <p className={styles.provenance}>{OPENING_DISCLAIMER} Each line links to its source game.</p>
    </section>;
  }

  const score = sessionScore(steps, line.side, session);
  const previousMove = steps[displayPly - 1];
  const noteKey = Object.keys(line.notes).map(Number).filter(p => p <= Math.min(displayPly, steps.length - 1)).sort((a, b) => b - a)[0];
  const missed = [...new Set([...session.mistakes, ...session.assisted])].sort((a, b) => a - b);
  const ownPlayed = steps.slice(0, session.ply).filter(s => s.side === line.side).length;
  return <section className={styles.trainer} aria-labelledby="line-title">
    <div className={styles.trainerTop}><button className={styles.back} onClick={closeLine}>← Openings</button><span className={styles.eyebrow}>{session.mode === "learn" ? "GUIDED LEARNING" : "RECALL PRACTICE"}</span><span>{ownPlayed} / {score.total}</span></div>
    {storageNotice}
    <div className={styles.trainingGrid}>
      <div className={styles.boardColumn}>
        <div className={styles.boardHeading}><div><h1 id="line-title">{line.title}</h1><p>{done ? "Line complete" : `You play ${line.side === "white" ? "White" : "Black"}`}</p></div><QuestIcon name="knight" /></div>
        <div className={styles.board} aria-label={`Chessboard, ${line.side} at the bottom`}><Board fen={positionAt(steps, displayPly)} orientation={line.side} interactive={!done && yourTurn} onMove={m => setSession(s => attemptOpeningMove(steps, line.side, s, m))} resetKey={session.resetKey} lastMove={previousMove ? [previousMove.from, previousMove.to] : null} highlights={!done && revealed && yourTurn ? [current.from] : []} /></div>
        <progress className={styles.progress} max={score.total} value={ownPlayed} aria-label="Opening progress" />
        <div className={styles.prompt} aria-live="polite" aria-atomic="true">
          <strong>{done ? (session.mode === "learn" ? "Now make it yours." : `${score.accuracy}% recalled without help`) : yourTurn ? (revealed ? `Play ${current.san}` : `Your move as ${line.side}`) : "Opponent is replying…"}</strong>
          <span>{done ? (session.mode === "learn" ? "Try the same line with the moves hidden." : `${score.correct} of ${score.total} moves correct without a hint or retry.`) : session.feedback || "Tap a piece, then its destination. You can also drag."}</span>
        </div>
        {!done && <div className={styles.actions}>
          <button className={styles.secondary} disabled={!yourTurn || revealed} onClick={() => setSession(revealOpeningMove)}>Reveal move</button>
          <button className={styles.primary} disabled={!yourTurn || !revealed} onClick={() => setSession(s => attemptOpeningMove(steps, line.side, revealOpeningMove(s), current))}>{session.mode === "learn" ? "Show on board" : "Play revealed move"}</button>
        </div>}
        {done && <div className={styles.actions}><button className={styles.secondary} onClick={closeLine}>All openings</button><button className={styles.primary} onClick={() => start(line, "recall")}>{session.mode === "learn" ? "Practice from memory" : "Practice again"} →</button></div>}
        {!done && <details className={styles.notation}><summary>Enter a move with the keyboard</summary><form onSubmit={e => { e.preventDefault(); playNotation(); }}><label htmlFor="opening-move">Move notation</label><input id="opening-move" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Nf3 or g1f3" value={moveText} onChange={e => setMoveText(e.target.value)} disabled={!yourTurn} /><button className={styles.secondary} disabled={!yourTurn || !moveText.trim()}>Play move</button></form></details>}
      </div>
      <aside className={styles.notebook}>
        <span className={styles.eyebrow}>THE IDEA BEHIND THE MOVES</span>
        <h2>{line.subtitle}</h2><p>{line.plan}</p>
        {(session.mode === "learn" || done || revealed) && <div className={styles.coachNote}><span>POSITION NOTE</span><p>{line.notes[noteKey] ?? line.plan}</p></div>}
        <div className={styles.scorebook}><h3>{done ? "Review the line" : "Moves played"}</h3><div className={styles.moves}>
          {steps.slice(0, done ? steps.length : session.ply).map((step, p) => <span key={p} className={styles.moveCell}>{p % 2 === 0 && <small>{p / 2 + 1}.</small>}<button disabled={!done} aria-label={`Review ${Math.floor(p / 2) + 1}${p % 2 ? "..." : "."} ${step.san}`} aria-current={done && displayPly === p + 1 ? "step" : undefined} onClick={() => setReviewPly(p + 1)}>{step.san}</button></span>)}
          {session.ply === 0 && <span className={styles.emptyMoves}>Your line will appear here as you play.</span>}
        </div></div>
        {done && session.mode === "recall" && <div className={styles.result}><h3>{missed.length ? "Give these moves another look" : "A clean run."}</h3><p>{missed.length ? "Moves you retried or revealed. Tap one to revisit the position before the move." : "Come back tomorrow to check what stuck."}</p><div className={styles.mistakes}>{missed.map(p => <button key={p} onClick={() => setReviewPly(p)}>{Math.floor(p / 2) + 1}{p % 2 ? "…" : "."} {steps[p].san}</button>)}</div></div>}
        <details className={styles.source}><summary>Source game & study notes</summary><p><a href={line.source.url} target="_blank" rel="noopener noreferrer">{line.source.game}, {line.source.year} ↗</a></p><p>{OPENING_DISCLAIMER}</p></details>
      </aside>
    </div>
  </section>;
}

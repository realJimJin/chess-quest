'use client';
import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from '../Board';
import MoveEntry from '../training/MoveEntry';
import { createPuzzle, mainline, tryMove, type MoveInput } from '@/lib/puzzle';
import { classifyAlternative, evaluate, formatScore } from '@/lib/engine';
import type { BookDiagram, BookPractice, BookPracticeEvent } from '@/lib/private-books';
import BookExcerpt from './BookExcerpt';
import styles from './books.module.css';

type Frame = { fen: string; san: string; last: [string, string] | null };
type Feedback = { kind: 'neutral' | 'good' | 'retry' | 'error'; text: string };
const playFrame = (fen: string, uci: string): Frame => {
  const chess = new Chess(fen);
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return { fen: chess.fen(), san: move.san, last: [move.from, move.to] };
};

export default function BookTrainer({ diagram, correction, saved, onRecord, onCorrection, onRead }: {
  diagram: BookDiagram; correction?: string; saved?: BookPractice;
  onRecord: (event: BookPracticeEvent) => Promise<void>;
  onCorrection: (fen: string) => Promise<void>; onRead: () => void;
}) {
  const initial = correction ?? diagram.fen;
  const solution = initial === diagram.fen ? diagram.training?.solution ?? [] : [];
  const [puzzle, setPuzzle] = useState(() => initial ? createPuzzle(initial, solution) : null);
  const [frames, setFrames] = useState<Frame[]>(initial ? [{ fen: initial, san: 'Start', last: null }] : []);
  const [ply, setPly] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [enginePassed, setEnginePassed] = useState(false);
  const [enginePractice, setEnginePractice] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [source, setSource] = useState(false);
  const [flip, setFlip] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [editFen, setEditFen] = useState(initial ?? '');
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'neutral', text: 'Find your move. Drag a piece, tap two squares, or type a move below.' });
  const [saveError, setSaveError] = useState('');
  const answerPanel = useRef<HTMLElement>(null);
  const boardPanel = useRef<HTMLElement>(null);
  const active = useRef(0);
  const locked = useRef(false);
  const assisted = useRef(false);
  const record = useRef(onRecord);
  useEffect(() => { if (revealed && window.innerWidth <= 900) answerPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [revealed]);
  useEffect(() => { record.current = onRecord; }, [onRecord]);
  useEffect(() => () => { active.current++; }, []);
  const persist = async (event: BookPracticeEvent) => {
    try { await record.current(event); }
    catch { setSaveError('Your result could not be saved on this device. You can keep training.'); }
  };
  const append = (next: Frame[]) => { setFrames([...frames, ...next]); setPly(frames.length + next.length - 1); };
  const move = async (input: MoveInput) => {
    if (!initial || !puzzle || locked.current || done || revealed || ply !== frames.length - 1) return;
    locked.current = true;
    const ticket = ++active.current;
    const outcome = tryMove(puzzle, input);
    setResetKey(key => key + 1); setHighlight([]);
    if (outcome.kind === 'illegal') { setFeedback({ kind: 'retry', text: 'That move is not legal. Try again.' }); locked.current = false; return; }
    void persist('attempt');
    if (outcome.kind === 'book') {
      const own = playFrame(puzzle.fen, input.from + input.to + (input.promotion ?? ''));
      append(outcome.reply ? [own, playFrame(own.fen, outcome.reply.uci)] : [own]);
      setPuzzle(outcome.puzzle); setDone(outcome.puzzle.done);
      if (outcome.puzzle.done) {
        setFeedback({ kind: 'good', text: assisted.current ? 'Book line complete with help. Reveal the answer to read the explanation.' : 'Correct — you completed the verified book line. Reveal the answer to read the explanation.' });
        if (!assisted.current) void persist('solved');
      } else setFeedback({ kind: 'good', text: `Correct: ${outcome.san}. The book replies ${outcome.reply?.san}. Your move again.` });
      locked.current = false; return;
    }
    if (outcome.kind === 'mate') {
      const own = playFrame(puzzle.fen, input.from + input.to + (input.promotion ?? ''));
      append([own]); setDone(true);
      setFeedback({ kind: 'good', text: 'Checkmate. Compare your finish with the book’s answer below.' });
      void persist('engine-checked'); locked.current = false; return;
    }
    setBusy(true); setFeedback({ kind: 'neutral', text: 'Checking your move…' });
    try {
      const expected = puzzle.options[0]?.uci;
      const best = await evaluate(puzzle.fen, 16, expected);
      if (active.current !== ticket) return;
      const alt = best.best === outcome.uci ? best : await evaluate(puzzle.fen, 16, outcome.uci);
      if (active.current !== ticket) return;
      const verdict = classifyAlternative(best.score, alt.score);
      const comparison = `Engine evaluation for the moving side: ${formatScore(alt.score)}; ${expected ? 'book move' : 'best move'} ${formatScore(best.score)}.`;
      if (verdict === 'inferior') {
        setFeedback({ kind: 'retry', text: `${outcome.san} loses ground. Try another move. ${comparison}` });
        setResetKey(key => key + 1);
      } else {
        append([playFrame(puzzle.fen, outcome.uci)]); setDone(true); setEnginePassed(true);
        setFeedback({ kind: 'good', text: `${verdict === 'winning' ? 'Still winning, though a stronger move is available.' : 'Good move according to the engine.'} ${comparison} This checks your move, not the complete book exercise. Reveal the book’s solution for its full variations and explanation.` });
        void persist('engine-checked');
      }
    } catch {
      if (active.current === ticket) setFeedback({ kind: 'error', text: 'The engine could not finish checking. Your move has not been graded. Try it again, or reveal the original book answer.' });
    } finally { if (active.current === ticket) { setBusy(false); locked.current = false; setResetKey(key => key + 1); } }
  };
  const continueEngine = async () => {
    const current = frames[frames.length - 1];
    if (!current || locked.current || !enginePassed || revealed || new Chess(current.fen).isGameOver()) return;
    locked.current = true; setBusy(true);
    const ticket = ++active.current;
    setFeedback({ kind: 'neutral', text: 'Finding the engine’s reply…' });
    try {
      const result = await evaluate(current.fen, 16);
      if (active.current !== ticket) return;
      const reply = playFrame(current.fen, result.best);
      append([reply]); setPuzzle(createPuzzle(reply.fen, [])); setEnginePractice(true); setEnginePassed(false);
      const over = new Chess(reply.fen).isGameOver(); setDone(over);
      setFeedback({ kind: 'neutral', text: over ? `Engine replies ${reply.san}. The game is over; compare with the book’s solution.` : `Engine replies ${reply.san}. Your move — it will be checked too. This continuation is engine practice, separate from the book’s printed line.` });
    } catch { if (active.current === ticket) setFeedback({ kind: 'error', text: 'The engine reply could not load. Your previous move remains checked. Retry Continue against engine or reveal the book answer.' }); }
    finally { if (active.current === ticket) { setBusy(false); locked.current = false; } }
  };
  const reset = () => {
    active.current++; locked.current = false; assisted.current = false;
    setBusy(false); setDone(false); setEnginePassed(false); setEnginePractice(false); setRevealed(false); setHighlight([]);
    setFrames(initial ? [{ fen: initial, san: 'Start', last: null }] : []); setPly(0);
    setPuzzle(initial ? createPuzzle(initial, solution) : null); setResetKey(key => key + 1);
    setFeedback({ kind: 'neutral', text: 'New attempt. Find your move.' });
  };
  const reveal = () => {
    active.current++; locked.current = false; assisted.current = true;
    setBusy(false); setRevealed(true); setHighlight([]); setResetKey(key => key + 1);
    setFeedback({ kind: 'neutral', text: 'Book solution revealed. Read the explanation below, or choose Try again for a fresh attempt.' });
    void persist('revealed');
  };
  const hint = async () => {
    if (!puzzle || locked.current || done || revealed || ply !== frames.length - 1) return;
    assisted.current = true; locked.current = true; setBusy(true);
    const ticket = ++active.current;
    void persist('revealed');
    try {
      const bookMove = puzzle.options[0]?.uci;
      const uci = bookMove ?? (await evaluate(puzzle.fen, 16)).best;
      if (active.current !== ticket) return;
      setHighlight([uci.slice(0, 2)]);
      setFeedback({ kind: 'neutral', text: `${bookMove ? 'Book hint' : 'Engine hint'}: look for a move with the piece on ${uci.slice(0, 2)}.` });
    } catch { if (active.current === ticket) setFeedback({ kind: 'error', text: 'The hint could not load. You can still reveal the book’s answer.' }); }
    finally { if (active.current === ticket) { locked.current = false; setBusy(false); } }
  };
  const replay = () => {
    if (!initial || !solution.length) return;
    const next: Frame[] = [{ fen: initial, san: 'Start', last: null }];
    for (const node of mainline(solution)) next.push(playFrame(next[next.length - 1].fen, node.uci));
    setFrames(next); setPly(0); setFeedback({ kind: 'neutral', text: 'Book line loaded. Use the arrows or your ← / → keys to step through it. The original answer below includes the other variations.' });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key) || busy) return;
      event.preventDefault(); setPly(value => Math.max(0, Math.min(frames.length - 1, value + (event.key === 'ArrowRight' ? 1 : -1))));
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [frames.length, busy]);
  const frame = frames[ply];
  const turn = initial?.split(' ')[1] === 'b' ? 'Black' : 'White';
  const interactive = !!frame && !busy && !done && !revealed && ply === frames.length - 1;
  const startBoard = initial ? new Chess(initial) : null;
  const castling = ([['K', 'e1', 'h1', 'w', 'White kingside'], ['Q', 'e1', 'a1', 'w', 'White queenside'], ['k', 'e8', 'h8', 'b', 'Black kingside'], ['q', 'e8', 'a8', 'b', 'Black queenside']] as const).filter(([, king, rook, color]) => startBoard?.get(king)?.type === 'k' && startBoard.get(king)?.color === color && startBoard.get(rook)?.type === 'r' && startBoard.get(rook)?.color === color);
  const correct = (fen: string) => void onCorrection(fen).catch(cause => setSaveError(cause instanceof Error ? cause.message : 'The correction could not be saved.'));
  return <div className={styles.trainingColumns}>
    <section ref={boardPanel} className={styles.boardWork} aria-label="Book exercise trainer">
      <div className={styles.boardTitle}><div><p className="eyebrow">{turn.toUpperCase()} TO MOVE</p><h3>{diagram.label}</h3></div><button className="text-action" onClick={() => setFlip(!flip)}>Flip board</button></div>
      <p className={styles.checkMode}>{solution.length && !enginePractice ? 'Verified book line · opponent replies automatically' : 'Engine move check · original book answer available'}</p>
      {diagram.needsReview && !correction && <p className={styles.review}>This scan has an uncertain position. Check the source diagram before relying on feedback.</p>}
      {frame ? <>
        <Board fen={frame.fen} orientation={(turn === 'White') !== flip ? 'white' : 'black'} interactive={interactive} onMove={input => void move(input)} lastMove={frame.last} highlights={highlight} resetKey={resetKey} />
        <div className={styles.feedback} data-kind={feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</div>
        <div className={styles.moveControls}><button className="btn" aria-label="Previous training move" disabled={busy || ply === 0} onClick={() => setPly(ply - 1)}>←</button><span>{ply} / {frames.length - 1}</span><button className="btn" aria-label="Next training move" disabled={busy || ply === frames.length - 1} onClick={() => setPly(ply + 1)}>→</button><button className="btn" onClick={reset}>Try again</button></div>
        {ply < frames.length - 1 && !revealed && <p className={styles.caption}>Reviewing an earlier move. Use → to return to the current position.</p>}
        <MoveEntry fen={frame.fen} disabled={!interactive} onMove={input => void move(input)} />
        <div className={styles.played} aria-label="Training moves">{frames.slice(1).map((item, index) => <button key={index} disabled={busy} aria-current={ply === index + 1 ? 'step' : undefined} onClick={() => setPly(index + 1)}>{item.san}</button>)}</div>
      </> : <p>This diagram needs a corrected position before moves can be checked. Its original answer is still available.</p>}
      {enginePassed && done && !revealed && frame && !new Chess(frame.fen).isGameOver() && <button className="btn" disabled={busy} onClick={() => void continueEngine()}>Continue against engine</button>}
      <div className={styles.trainingActions}><button className="btn" disabled={!frame || busy || done || revealed || ply !== frames.length - 1} onClick={() => void hint()}>Hint</button><button className="btn btn-primary" disabled={revealed} onClick={reveal}>{revealed ? 'Book solution shown' : 'Show book solution'}</button></div>
      {saved && <p className={styles.caption}>{saved.attempts} move attempts{saved.bookSolved ? ' · verified book line completed' : saved.engineChecked ? ' · move checked by engine' : ''}{saved.revealed ? ' · answer or hint viewed' : ''}. Reading an answer never marks an exercise solved.</p>}
      {saveError && <p className="notice-error" role="alert">{saveError}</p>}
      <details className={styles.correction}><summary>Check or correct the source position</summary><button className="btn" onClick={() => setSource(!source)}>{source ? 'Hide source diagram' : 'Show source diagram'}</button>
        {source && <BookExcerpt region={{ page: diagram.page, x: Math.max(0, diagram.x - .02), y: Math.max(0, diagram.y - .06), width: Math.min(1 - Math.max(0, diagram.x - .02), diagram.width + .04), height: Math.min(1 - Math.max(0, diagram.y - .06), diagram.height + .09) }} label={`${diagram.label} · original diagram`} />}
        {initial && <><label className={styles.castling}>Starting side <select aria-label="Training starting side" value={initial.split(' ')[1]} onChange={event => { const parts = initial.split(' '); parts[1] = event.target.value; correct(parts.join(' ')); }}><option value="w">White</option><option value="b">Black</option></select></label>{castling.map(([right, , , , label]) => <label className={styles.castling} key={right}><input type="checkbox" checked={initial.split(' ')[2].includes(right)} onChange={event => { const parts = initial.split(' '); const enabled = new Set(parts[2].replace('-', '').split('')); if (event.target.checked) enabled.add(right); else enabled.delete(right); parts[2] = 'KQkq'.split('').filter(r => enabled.has(r)).join('') || '-'; correct(parts.join(' ')); }} />{label}</label>)}</>}
        <p className={styles.caption}>Castling rights depend on the book’s game history. A corrected position uses engine feedback unless it matches the verified book position.</p><textarea aria-label="Training corrected FEN" className="field" value={editFen} onChange={e => setEditFen(e.target.value)} /><button className="btn" onClick={() => correct(editFen.trim())}>Save corrected position</button>
      </details>
    </section>
    <aside ref={answerPanel} className={styles.answerPanel} aria-label="Book solution">
      <p className="eyebrow">THE BOOK’S ANSWER</p><h3>{revealed ? 'Solution & explanation' : 'Work it out first'}</h3>
      {revealed ? <>
        <button className={`text-action ${styles.backToBoard}`} onClick={() => boardPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>↑ Back to board</button>
        <p className={styles.caption}>The original answer from your book, including its printed variations and scoring. Engine feedback is separate from the author’s solution.</p>
        {solution.length > 0 && <button className="btn" onClick={replay}>Replay book line</button>}
        {diagram.training?.answer.map((part, index) => <BookExcerpt key={index} region={part} label={`${diagram.label} · book solution${index ? ' continued' : ''}`} />)}
      </> : <p>Choose your move on the board. The answer stays hidden until you select “Show book solution.”</p>}
      <button className="text-action" onClick={onRead}>Read this chapter in the full book ↗</button>
    </aside>
  </div>;
}

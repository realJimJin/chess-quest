'use client';
import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import Board from '../Board';
import MoveEntry from '../training/MoveEntry';
import type { MoveInput } from '@/lib/puzzle';
import type { BookDiagram } from '@/lib/private-books';
import styles from './books.module.css';

export default function BookBoard({ diagram, correction, completed, onComplete, onCorrection, onSource }: {
  diagram: BookDiagram; correction?: string; completed: boolean;
  onComplete: (value: boolean) => Promise<void>; onCorrection: (fen: string) => Promise<void>; onSource: () => void;
}) {
  const initial = correction ?? diagram.fen;
  const [history, setHistory] = useState<{ fen: string; san: string; last: [string, string] | null }[]>(initial ? [{ fen: initial, san: 'Start', last: null }] : []);
  const [ply, setPly] = useState(0);
  const [flip, setFlip] = useState(false);
  const [error, setError] = useState('');
  const [editFen, setEditFen] = useState(initial ?? '');
  const [resetKey, setResetKey] = useState(0);
  const frame = history[ply];
  const startFen = history[0]?.fen;
  const startBoard = startFen ? new Chess(startFen) : null;
  const castlingOptions = ([['K', 'e1', 'h1', 'w', 'White kingside'], ['Q', 'e1', 'a1', 'w', 'White queenside'], ['k', 'e8', 'h8', 'b', 'Black kingside'], ['q', 'e8', 'a8', 'b', 'Black queenside']] as const).filter(([, king, rook, color]) => startBoard?.get(king)?.type === 'k' && startBoard.get(king)?.color === color && startBoard.get(rook)?.type === 'r' && startBoard.get(rook)?.color === color);
  const move = (input: MoveInput) => {
    if (!frame) return;
    try {
      const chess = new Chess(frame.fen); const result = chess.move(input);
      const next = history.slice(0, ply + 1);
      next.push({ fen: chess.fen(), san: result.san, last: [result.from, result.to] });
      setHistory(next); setPly(next.length - 1); setError('');
    } catch { setError('That move is not legal in this position.'); setResetKey(value => value + 1); }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); setPly(value => Math.max(0, Math.min(history.length - 1, value + (event.key === 'ArrowRight' ? 1 : -1))));
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [history.length]);
  const changeTurn = (side: string) => {
    if (!startFen) return;
    const parts = startFen.split(' '); parts[1] = side;
    try { const chess = new Chess(parts.join(' ')); setHistory([{ fen: chess.fen(), san: 'Start', last: null }]); setPly(0); setError(''); }
    catch { setError('That side-to-move setting is invalid.'); }
  };
  return <section className={styles.boardWork} aria-label="Book analysis board">
    <div className={styles.boardTitle}><div><p className="eyebrow">WORK IT OUT</p><h3>{diagram.label}</h3></div><button className="text-action" onClick={onSource}>Source page {diagram.page} ↗</button></div>
    {(diagram.needsReview || !initial || diagram.side === 'unknown') && !correction && <p className={styles.review}>Check this imported position against the page before studying. The scan has uncertain squares or side to move.</p>}
    {frame ? <>
      <div className={styles.boardOptions}><label>Starting side <select aria-label="Starting side" value={history[0].fen.split(' ')[1]} onChange={event => changeTurn(event.target.value)}><option value="w">White</option><option value="b">Black</option></select></label><button onClick={() => setFlip(!flip)}>Flip board</button></div>
      {castlingOptions.length > 0 && <details className={styles.correction}><summary>Castling permissions</summary><p className={styles.caption}>A diagram alone cannot show whether a king or rook moved earlier. Enable the castling options allowed by the book before analyzing.</p>{castlingOptions.map(([right, , , , label]) => <label key={right} className={styles.castling}><input type="checkbox" checked={history[0].fen.split(' ')[2].includes(right)} onChange={event => { const parts = history[0].fen.split(' '); const enabled = new Set(parts[2].replace('-', '').split('')); if (event.target.checked) enabled.add(right); else enabled.delete(right); parts[2] = 'KQkq'.split('').filter(r => enabled.has(r)).join('') || '-'; setHistory([{ fen: new Chess(parts.join(' ')).fen(), san: 'Start', last: null }]); setPly(0); }} />{label}</label>)}</details>}
      <Board fen={frame.fen} orientation={(history[0].fen.split(' ')[1] === 'w') !== flip ? 'white' : 'black'} interactive onMove={move} lastMove={frame.last} resetKey={resetKey} />
      <div className={styles.moveControls}><button className="btn" disabled={ply === 0} onClick={() => setPly(0)}>Reset</button><button className="btn" aria-label="Previous board move" disabled={ply === 0} onClick={() => setPly(ply - 1)}>←</button><span>{ply} / {history.length - 1}</span><button className="btn" aria-label="Next board move" disabled={ply === history.length - 1} onClick={() => setPly(ply + 1)}>→</button></div>
      <MoveEntry fen={frame.fen} disabled={false} onMove={move} />
      <div className={styles.played} aria-label="Your analysis moves">{history.slice(1).map((item, index) => <button key={index} aria-current={ply === index + 1 ? 'step' : undefined} onClick={() => setPly(index + 1)}>{item.san}</button>)}</div>
      <p className={styles.caption}>Play both sides and use ← / → to go back and forward. Compare your analysis with the book’s answers; this board does not grade your moves.</p>
    </> : <p>The source page is available, but this diagram needs a corrected position before it can be played.</p>}
    {error && <p className="notice-error" role="alert">{error}</p>}
    <button className="btn" aria-pressed={completed} onClick={() => void onComplete(!completed).catch(() => setError('Your study mark could not be saved. Please try again.'))}>{completed ? '✓ Studied · undo mark' : 'Mark this position studied'}</button>
    <details className={styles.correction}><summary>Correct an imported position</summary><p className={styles.caption}>Paste a corrected FEN if the scan was misread. Your correction stays on this device.</p><textarea aria-label="Corrected FEN" className="field" value={editFen} onChange={e => setEditFen(e.target.value)} /><button className="btn" onClick={() => void onCorrection(editFen.trim()).catch(cause => setError(cause instanceof Error ? cause.message : 'The correction could not be saved.'))}>Save corrected position</button></details>
  </section>;
}

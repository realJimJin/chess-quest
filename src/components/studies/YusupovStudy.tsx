'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Board from '../Board';
import { useApp } from '@/lib/store';
import { YUSUPOV_BOOKS, replayLine, type YusupovBook, type YusupovPosition } from '@/lib/studies/yusupov';
import styles from './yusupov.module.css';

function Position({ book, position }: { book: YusupovBook; position: YusupovPosition }) {
  const { ready, importBook } = useApp();
  const router = useRouter();
  const [line, setLine] = useState(0);
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const frames = useMemo(() => replayLine(position.fen, position.lines[line]), [position, line]);
  const frame = frames[ply];
  const last = frames.length - 1;
  const step = (value: number) => { setPlaying(false); setPly(Math.max(0, Math.min(last, value))); };

  useEffect(() => {
    if (!playing || ply >= last) return;
    const timer = window.setTimeout(() => setPly(value => Math.min(last, value + 1)), 1200);
    return () => window.clearTimeout(timer);
  }, [playing, last, ply]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); setPlaying(false);
      setPly(value => event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, value + (event.key === 'ArrowRight' ? 1 : -1))));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const practice = async (wholeBook: boolean) => {
    if (!ready || pending) return;
    setPending(true); setError('');
    try {
      // Stable sample IDs keep these separate from privately imported full books.
      // Await storage before navigating: the training route captures its queue once.
      // Re-save on retry even if an earlier failed write updated in-memory state.
      await importBook(book.pack.book, book.pack.exercises);
      const params = new URLSearchParams({ book: book.id, mode: 'flow' });
      if (!wholeBook) params.set('id', position.exercise.id);
      router.push(`/train?${params}`);
    } catch {
      setError('The practice set could not be saved on this device. Please try again. You can still replay every position here.');
    } finally { setPending(false); }
  };

  return <section className={styles.workspace} aria-label="Interactive sample position">
    <div className={styles.boardColumn}>
      <div className={styles.boardHeading}><span>{position.exercise.sideToMove === 'white' ? 'White' : 'Black'} to move</span><button onClick={() => setFlipped(!flipped)}>Flip board</button></div>
      <Board fen={frame.fen} orientation={(position.exercise.sideToMove === 'white') !== flipped ? 'white' : 'black'} interactive={false} lastMove={frame.last} />
      <div className={styles.controls} aria-label="Replay controls">
        <button className="btn" onClick={() => step(0)} disabled={ply === 0} aria-label="First position">|←</button>
        <button className="btn" onClick={() => step(ply - 1)} disabled={ply === 0} aria-label="Previous move">←</button>
        <button className="btn" onClick={() => { if (ply === last) setPly(0); setPlaying(!(playing && ply < last)); }}>{playing && ply < last ? 'Pause' : 'Play line'}</button>
        <button className="btn" onClick={() => step(ply + 1)} disabled={ply === last} aria-label="Next move">→</button>
        <button className="btn" onClick={() => step(last)} disabled={ply === last} aria-label="Last position">→|</button>
      </div>
      <p className={styles.caption} role="status">{frame.label} · {ply} / {last} half-moves</p>
      <p className={styles.caption}>Use ← and → on your keyboard, or tap a move below.</p>
    </div>
    <div className={styles.lesson}>
      <p className="eyebrow">LEARN THE IDEA</p><h2>{position.title}</h2>
      <p>{position.note}</p>
      <p className={styles.source}>{position.source}<br />Page {position.printedPage} · <a href={`${book.pdfUrl}#page=${position.pdfPage}`} target="_blank" rel="noreferrer">See the publisher’s diagram ↗</a></p>
      {position.lines.length > 1 && <label className={styles.linePicker}>Replay variation<select aria-label="Replay variation" value={line} onChange={e => { setLine(Number(e.target.value)); setPly(0); setPlaying(false); }}>{position.lines.map((moves, index) => <option key={index} value={index}>{index === 0 ? 'Main line' : `Alternative ${index}`} · {moves.split(' ').slice(0, 4).join(' ')}</option>)}</select></label>}
      <div className={styles.moves} aria-label="Moves">{frames.slice(1).map((move, index) => <button key={index} onClick={() => step(index + 1)} aria-current={ply === index + 1 ? 'step' : undefined}>{move.label}</button>)}</div>
      <div className={styles.practice}><button className="btn btn-primary" disabled={!ready || pending} onClick={() => practice(false)}>{pending ? 'Opening practice…' : 'Practice this position'}</button><button className="btn" disabled={!ready || pending} onClick={() => practice(true)}>Practice all 3</button></div>
      {error && <p role="alert" className="notice-error">{error}</p>}
      <p className={styles.caption}>Practice starts from the original position. Play your side; the trainer replies, offers hints, and saves your attempts on this device.</p>
    </div>
  </section>;
}

export default function YusupovStudy() {
  const [bookIndex, setBookIndex] = useState(0);
  const [positionIndex, setPositionIndex] = useState(0);
  const book = YUSUPOV_BOOKS[bookIndex];
  const position = book.positions[positionIndex];
  return <div className={styles.page}>
    <Link href="/" className={styles.back}>← Library</Link>
    <p className="my-5"><Link className="btn" href="/books">Open your complete private books →</Link></p>
    <header className={styles.header}><p className="eyebrow">THE ORANGE BOOKS · ARTUR YUSUPOV</p><h1>The fundamentals.</h1><p>Build. Boost. Evolve. Study an idea on the board, then calculate it yourself.</p></header>
    <div className={styles.coverage}><strong>Selected sample positions — not the full books.</strong><p>Nine positions from three publisher excerpts, with Chess Quest explanations. Only the chapters listed below are represented. Full digital editions open separately on ChessTempo; a purchase there does not import the book into Chess Quest.</p></div>
    <nav className={styles.books} aria-label="Yusupov books">{YUSUPOV_BOOKS.map((item, index) => <button key={item.id} onClick={() => { setBookIndex(index); setPositionIndex(0); }} aria-pressed={bookIndex === index}><span className={styles.volume}>0{index + 1}</span><strong>{item.title}</strong><span>The Fundamentals</span><small>{item.chapter}<br />3 selected positions</small></button>)}</nav>
    <div className={styles.bookHeading}><div><p className="eyebrow">{book.chapter}</p><h2>{book.title}</h2></div><div className={styles.links}><a href={book.pdfUrl} target="_blank" rel="noreferrer">Free sample PDF ↗</a><a href={book.editionUrl} target="_blank" rel="noreferrer">Full digital edition ↗</a></div></div>
    <nav className={styles.positions} aria-label="Sample positions">{book.positions.map((item, index) => <button key={item.id} onClick={() => setPositionIndex(index)} aria-pressed={positionIndex === index}>{index + 1}. {item.title}</button>)}</nav>
    <Position key={position.exercise.id} book={book} position={position} />
    <footer className={styles.footer}><p>Work through the full books in this order: Build Up 1 → Boost 1 → Evolution 1. These few positions are a preview, not a chapter test or a rating assessment.</p><p>Already have a converted exercise collection? <Link href="/import">Import it privately</Link>. Reading and replaying here do not change your practice scores.</p></footer>
  </div>;
}

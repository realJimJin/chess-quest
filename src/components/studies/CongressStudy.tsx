'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Board from '../Board';
import MoveEntry from '../training/MoveEntry';
import type { MoveInput } from '@/lib/puzzle';
import { CONGRESS, compileChapter, congressProgressStore, practicePlies, progressKey, type CongressProgressStore, type StudyChapter } from '@/lib/studies/congress';
import styles from './congress.module.css';

export default function CongressStudy({ progressStore = congressProgressStore }: { progressStore?: CongressProgressStore }) {
  const [group, setGroup] = useState('yunker');
  const [id, setId] = useState(CONGRESS.chapters[0].id);
  const [progress, setProgress] = useState<string[] | null>(null);
  const [storageError, setStorageError] = useState<'load' | 'save' | null>(null);
  const chapter = CONGRESS.chapters.find(c => c.id === id)!;
  const visible = CONGRESS.chapters.filter(c => c.groups.includes(group));
  // Storage is loaded after SSR; never write over unreadable existing data.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { setProgress(progressStore.load()); } catch { setStorageError('load'); }
    const target = CONGRESS.chapters.find(c => `#${c.id}` === window.location.hash);
    if (target) { setId(target.id); setGroup(target.section); }
  }, [progressStore]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function select(next: StudyChapter) {
    setId(next.id);
    window.history.replaceState(null, '', `#${next.id}`);
  }
  function record(ply: number) {
    if (progress === null) return;
    const key = progressKey(chapter, ply);
    const next = progress.includes(key) ? progress : [...progress, key];
    setProgress(next);
    try { progressStore.save(next); setStorageError(null); } catch { setStorageError('save'); }
  }
  function retry() {
    try {
      if (storageError === 'load') setProgress(progressStore.load());
      else if (progress) progressStore.save(progress);
      setStorageError(null);
    } catch { /* Keep unsaved results in memory and leave the notice visible. */ }
  }
  return <section className={styles.study}>
    <header className={styles.heading}>
      <div><Link href="/">← Library</Link><p className="eyebrow">TOURNAMENT STUDY · NOVEMBER 2026</p><h1>{CONGRESS.title}</h1><p>Yunker’s repertoire. Your opponents. One board to prepare.</p></div>
      <a className="btn" href="/studies/philidalphia-national-congress.pgn" download>Download study PGN</a>
    </header>
    <p className={styles.scope}>55 chapters · 27 source-checked Yunker games · 222 opening moves to practice. Every Yunker line keeps her original move order. This is a selected sample of her games, not every variation she has ever played.</p>
    {storageError && <div className="notice-error" role="alert">{storageError === 'load' ? 'Saved study progress could not be read. You can practice; existing progress will not be overwritten.' : 'Your result is in memory but could not be saved on this device.'} <button className="btn" onClick={retry}>Retry saving</button></div>}
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <label className={styles.selector}>Choose repertoire or opponent<select className="field" value={group} onChange={e => {
          const value = e.target.value; setGroup(value);
          const first = CONGRESS.chapters.find(c => c.groups.includes(value));
          if (first) select(first);
        }}>{CONGRESS.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <p className={styles.groupNote}>{CONGRESS.groups.find(g => g.id === group)?.summary}</p>
        <label className={`${styles.selector} ${styles.mobileSelect}`}>Chapter<select className="field" value={visible.some(c => c.id === id) ? id : ''} onChange={e => select(CONGRESS.chapters.find(c => c.id === e.target.value)!)}>{visible.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <div className={styles.chapterList} aria-label="Study chapters">{visible.map((c, index) => <button key={c.id} aria-current={c.id === id ? 'true' : undefined} onClick={() => select(c)}>
          <span>{String(index + 1).padStart(2, '0')} · {c.section === 'yunker' ? `YUNKER · ${c.side?.toUpperCase()}` : c.section === 'history' ? 'YOUR EARLIER GAME' : 'OPPONENT EVIDENCE'}</span>
          <strong>{c.title}</strong><small>{c.side ? `${practicePlies(c).filter(p => progress?.includes(progressKey(c, p))).length} / ${practicePlies(c).length} recalled` : c.confidence}</small>
        </button>)}</div>
        <p className={styles.storage}>Recall progress saves on this device.</p>
      </aside>
      <StudyBoard key={id} chapter={chapter} onRecall={record} onNextChapter={() => {
        const next = visible[visible.findIndex(c => c.id === id) + 1];
        if (next) select(next);
      }} hasNextChapter={visible.findIndex(c => c.id === id) < visible.length - 1} />
    </div>
  </section>;
}

function StudyBoard({ chapter, onRecall, onNextChapter, hasNextChapter }: { chapter: StudyChapter; onRecall: (ply: number) => void; onNextChapter: () => void; hasNextChapter: boolean }) {
  const compiled = useMemo(() => compileChapter(chapter), [chapter]);
  const questions = useMemo(() => practicePlies(chapter), [chapter]);
  const [mode, setMode] = useState<'learn' | 'practice'>('learn');
  const [ply, setPly] = useState(0);
  const [quiz, setQuiz] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [reset, setReset] = useState(0);
  const done = mode === 'practice' && quiz >= questions.length;
  const questionPly = questions[quiz] ?? chapter.trainingPlies;
  const practiceDisplay = Math.min(questionPly + (answered ? 1 : 0), chapter.trainingPlies);
  const reviewing = mode === 'practice' && !done && ply !== practiceDisplay;
  const active = mode === 'practice' && !done && !answered && !reviewing;
  const limit = mode === 'learn' ? chapter.moves.length : done ? chapter.trainingPlies : practiceDisplay;
  const expected = compiled.moves[questionPly];
  const last = compiled.moves[ply - 1];
  function navigate(value: number) { setPly(Math.min(limit, Math.max(0, value))); }
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      const target = e.target;
      if (e.altKey || e.ctrlKey || e.metaKey || (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); setPly(p => Math.min(limit, Math.max(0, p + (e.key === 'ArrowLeft' ? -1 : 1))));
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [limit]);
  function start(value: 'learn' | 'practice') {
    setMode(value); setQuiz(0); setPly(value === 'practice' ? questions[0] : 0);
    setAnswered(false); setAssisted(false); setHint(false); setFeedback(''); setReset(r => r + 1);
  }
  function attempt(move: MoveInput) {
    if (!active || !expected) return;
    if (move.from === expected.from && move.to === expected.to && (move.promotion || '') === (expected.promotion || '')) {
      if (!assisted) onRecall(questionPly);
      setFeedback(assisted ? `Recorded move: ${expected.san}. Assisted — try it unaided next time.` : `Correct — ${expected.san}, as played by Yunker.`);
      setAnswered(true); setPly(questionPly + 1); setHint(false);
    } else {
      setAssisted(true); setFeedback('That is a legal move, but a different choice from Yunker in this game. Try again or reveal her move.');
    }
    setReset(r => r + 1);
  }
  function reveal() {
    setAssisted(true); setAnswered(true); setHint(false); setPly(questionPly + 1);
    setFeedback(`Yunker played ${expected.san}. This revealed move does not count as unaided recall.`);
  }
  function nextQuestion() {
    const next = quiz + 1; setQuiz(next); setPly(questions[next] ?? chapter.trainingPlies);
    setAnswered(false); setAssisted(false); setHint(false); setFeedback('');
  }
  const annotation = chapter.annotations[String(ply)];
  return <article className={styles.chapter}>
    <header className={styles.chapterHeading}><p className="eyebrow">{chapter.section === 'yunker' ? `PLAY AS ${chapter.side?.toUpperCase()}` : 'REFERENCE GAME · VIEW MOVES'}</p><h2>{chapter.title}</h2><p>{chapter.confidence} · {chapter.date} · {chapter.gameType}</p></header>
    <div className={styles.modes}><button className="btn" aria-pressed={mode === 'learn'} onClick={() => start('learn')}>Learn / replay game</button>{questions.length > 0 && <button className="btn" aria-pressed={mode === 'practice'} onClick={() => start('practice')}>Practice Yunker’s moves</button>}</div>
    <div className={styles.boardLayout}>
      <div className={styles.boardColumn}>
        <Board fen={compiled.positions[ply]} orientation={flipped ? (chapter.orientation === 'white' ? 'black' : 'white') : chapter.orientation} interactive={active} onMove={attempt} resetKey={reset} lastMove={last ? [last.from, last.to] : null} arrows={hint && active ? [{ from: expected.from, to: expected.to }] : []} />
        <div className={styles.controls} aria-label="Move navigation"><button className="btn" disabled={ply === 0} onClick={() => navigate(0)}>Start</button><button className="btn" disabled={ply === 0} onClick={() => navigate(ply - 1)}>← Back</button><button className="btn" disabled={ply >= limit} onClick={() => navigate(ply + 1)}>Next →</button><button className="btn" onClick={() => setFlipped(!flipped)}>Flip board</button></div>
        <p className={styles.caption}>← → arrow keys move backward and forward. {mode === 'learn' ? `${ply} / ${chapter.moves.length} half-moves` : `Practice ${Math.min(quiz + 1, questions.length)} / ${questions.length}`}</p>
        {reviewing && <button className="btn btn-primary" onClick={() => setPly(practiceDisplay)}>Return to practice position</button>}
        {mode === 'practice' && !done && <>
          <p className={styles.prompt}>{answered ? 'Move recorded. Continue when ready.' : `Play ${chapter.side === 'white' ? 'White' : 'Black'}’s move ${Math.floor(questionPly / 2) + 1}. Drag a piece, tap its squares, or type a move.`}</p>
          <MoveEntry key={`${quiz}:${reviewing}`} fen={compiled.positions[ply]} disabled={!active} onMove={attempt} />
          <div className={styles.controls}>{!answered ? <><button className="btn" disabled={!active} onClick={() => { setAssisted(true); setHint(true); }}>Hint arrow</button><button className="btn" disabled={!active} onClick={reveal}>Reveal move</button></> : <button className="btn btn-primary" onClick={nextQuestion}>{quiz === questions.length - 1 ? 'Finish practice' : 'Play opponent reply →'}</button>}</div>
        </>}
        <p role="status" aria-live="polite" className={styles.feedback}>{feedback}</p>
        {done && <div className={styles.explanation}><h3>Opening practice complete</h3><p>Unaided correct moves are saved in your recall total. You can replay the full source game or practice again.</p><button className="btn" onClick={() => start('practice')}>Practice again</button>{hasNextChapter && <button className="btn btn-primary" onClick={onNextChapter}>Next chapter →</button>}</div>}
      </div>
      <div className={styles.notes}>
        <div className={styles.explanation}><p>{chapter.note}</p>{annotation && <p><strong>At this move:</strong> {annotation}</p>}</div>
        <p className={styles.source}>{chapter.white} — {chapter.black}<br /><a href={chapter.url} target="_blank" rel="noreferrer">Open original source ↗</a><br />{chapter.section === 'yunker' ? 'Moves are from the recorded game; teaching notes are our explanations.' : 'Scouting reference only. These moves are not attributed to Yunker.'}</p>
        {chapter.opponentEvidence.length > 0 && <details><summary>Why this line is in your prep</summary>{chapter.opponentEvidence.map(e => <p key={e.url} className={styles.source}><a href={e.url} target="_blank" rel="noreferrer">{e.title} ↗</a><br />{e.identity}. {e.scope}</p>)}</details>}
        <div className={styles.movelist} aria-label="Game moves">{chapter.moves.slice(0, mode === 'practice' && !done ? practiceDisplay : chapter.moves.length).map((san, i) => <button key={i} disabled={i + 1 > limit} aria-current={ply === i + 1 ? 'step' : undefined} onClick={() => navigate(i + 1)}>{i % 2 === 0 && <span>{i / 2 + 1}.</span>}{san}</button>)}</div>
      </div>
    </div>
  </article>;
}

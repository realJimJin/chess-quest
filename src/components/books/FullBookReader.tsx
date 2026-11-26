'use client';
import { useEffect, useRef, useState } from 'react';
import { correctBookDiagram, loadFullBook, markBookDiagram, readBookProgress, saveBookPage, type BookDiagram, type FullBook, type ReadingProgress } from '@/lib/private-books';
import BookPage from './BookPage';
import BookBoard from './BookBoard';
import styles from './books.module.css';

export default function FullBookReader({ id, onClose }: { id: string; onClose: () => void }) {
  const [record, setRecord] = useState<{ book: FullBook; pdf: Blob } | null>(null);
  const [progress, setProgress] = useState<ReadingProgress>({ page: 1, completed: [] });
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState('1');
  const [selected, setSelected] = useState<BookDiagram | null>(null);
  const [error, setError] = useState('');
  const boardColumn = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadFullBook(id), readBookProgress(id)]).then(([loaded, saved]) => {
      if (!alive) return;
      const first = saved.page > 1 ? Math.min(saved.page, loaded.book.pageCount) : loaded.book.chapters[0]?.page ?? 1;
      setRecord(loaded); setProgress(saved); setPage(first); setPageDraft(String(first));
      setSelected(loaded.book.diagrams.find(diagram => diagram.page >= first) ?? loaded.book.diagrams[0] ?? null);
    }).catch(() => { if (alive) setError('This book could not be opened from this device. Please retry or reimport your package.'); });
    return () => { alive = false; };
  }, [id]);
  const navigate = (value: number) => {
    if (!record) return;
    const next = Math.max(1, Math.min(record.book.pageCount, Math.round(value) || 1));
    setPage(next); setPageDraft(String(next));
    void saveBookPage(id, next).catch(() => setError('Your reading page could not be saved. The book is still available.'));
  };
  const selectDiagram = (diagram: BookDiagram) => {
    setSelected(diagram);
    if (window.innerWidth <= 900) boardColumn.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (!record) return <div><button className="btn" onClick={onClose}>← All full books</button><p role={error ? 'alert' : 'status'}>{error || 'Opening your complete book…'}</p></div>;
  const { book, pdf } = record;
  const pageDiagrams = book.diagrams.filter(diagram => diagram.page === page);
  const chapter = book.chapters.find(item => page >= item.page && page <= item.endPage);
  return <div className={styles.reader}>
    <button className={styles.back} onClick={onClose}>← All full books</button>
    <header className={styles.readerHeader}><div><p className="eyebrow">YOUR COMPLETE BOOK · SAVED ON THIS DEVICE</p><h1>{book.title}</h1><p>{book.author} · {book.pageCount} pages · {book.diagrams.length} imported diagrams · {progress.completed.length} marked studied</p></div></header>
    <div className={styles.readerTools}><label>Chapter<select aria-label="Book chapter" value={chapter?.id ?? ''} onChange={event => { const next = book.chapters.find(c => c.id === event.target.value); if (next) { navigate(next.page); setSelected(book.diagrams.find(d => d.page >= next.page && d.page <= next.endPage) ?? null); } }}><option value="">Front matter / index</option>{book.chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className={styles.pageControls}><button className="btn" aria-label="Previous book page" disabled={page === 1} onClick={() => navigate(page - 1)}>←</button><label>PDF page <input type="number" min={1} max={book.pageCount} value={pageDraft} aria-label="PDF page" onChange={e => setPageDraft(e.target.value)} onBlur={() => navigate(Number(pageDraft))} onKeyDown={e => { if (e.key === 'Enter') navigate(Number(pageDraft)); }} /></label><span>/ {book.pageCount}</span><button className="btn" aria-label="Next book page" disabled={page === book.pageCount} onClick={() => navigate(page + 1)}>→</button></div></div>
    {error && <p className="notice-error" role="alert">{error}</p>}
    <div className={styles.readerColumns}>
      <BookPage pdf={pdf} page={page} diagrams={pageDiagrams} selected={selected?.id} onSelect={selectDiagram} />
      <div ref={boardColumn} className={styles.boardColumn}>{pageDiagrams.length > 0 && <label className={styles.diagramPicker}>Positions on this page<select aria-label="Position on this page" value={pageDiagrams.some(item => item.id === selected?.id) ? selected?.id : ''} onChange={e => setSelected(pageDiagrams.find(item => item.id === e.target.value) ?? null)}><option value="">Choose a diagram</option>{pageDiagrams.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        {selected ? <BookBoard key={`${selected.id}:${progress.positions?.[selected.id] ?? ''}`} diagram={selected} correction={progress.positions?.[selected.id]} completed={progress.completed.includes(selected.id)} onSource={() => navigate(selected.page)} onComplete={async value => { await markBookDiagram(id, selected.id, value); setProgress(await readBookProgress(id)); }} onCorrection={async fen => { await correctBookDiagram(id, selected.id, fen); setProgress(await readBookProgress(id)); }} /> : <p className={styles.caption}>Choose an outlined diagram on a book page to open the analysis board.</p>}
      </div>
    </div>
  </div>;
}

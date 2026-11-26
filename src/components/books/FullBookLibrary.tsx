'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { importBookPackage, importPrivateDelivery, listFullBooks, type FullBookSummary } from '@/lib/private-books';
import FullBookReader from './FullBookReader';
import styles from './books.module.css';

export default function FullBookLibrary() {
  const [books, setBooks] = useState<FullBookSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('Loading your private books…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef('');
  const refresh = async () => setBooks(await listFullBooks());
  useEffect(() => {
    const load = () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const delivery = hash.get('import'), key = hash.get('key');
      const signature = delivery && key ? `${delivery}:${key}` : 'library';
      if (started.current === signature) return; started.current = signature;
      void (async () => {
      try {
        if (delivery && key) {
          setBusy(true); setSelected(''); setError('');
          await importPrivateDelivery(delivery, key, setMessage);
          // The decryption key stays in the URL fragment, never an HTTP request.
          // Remove it from the current history entry once all books are saved.
          window.history.replaceState(null, '', window.location.pathname);
          setMessage('Your full books are saved on this device. Choose a book to begin.');
        } else setMessage('');
        await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'The books could not be loaded.'); setMessage(''); }
      finally { await refresh().catch(() => {}); setBusy(false); }
      })();
    };
    load(); window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, []);
  const importFiles = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    setBusy(true); setError('');
    try {
      for (const [index, file] of Array.from(files).entries()) {
        setMessage(`Importing book ${index + 1} of ${files.length}…`);
        await importBookPackage(new Uint8Array(await file.arrayBuffer()));
      }
      await refresh(); setMessage('Full books added. Your existing books and progress are unchanged.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The package could not be imported.'); }
    finally { await refresh().catch(() => {}); setBusy(false); setMessage(''); }
  };
  if (selected) return <FullBookReader key={selected} id={selected} onClose={() => setSelected('')} />;
  return <div className={styles.library}>
    <Link href="/" className={styles.back}>← Library</Link>
    <header className={styles.libraryHeader}><p className="eyebrow">YOUR PRIVATE BOOKS</p><h1>Read. Calculate. Understand.</h1><p>Learn from the full book, test your moves, and reveal the original solutions.</p></header>
    {message && <p className={styles.message} role="status">{message}</p>}
    {error && <p className="notice-error" role="alert">{error}</p>}
    <div className={styles.bookGrid}>{books.map((book, index) => <button key={book.id} className={styles.bookCard} disabled={busy} onClick={() => setSelected(book.id)}><span className={styles.bookNumber}>0{index + 1}</span><p className="eyebrow">FULL BOOK</p><h2>{book.title}</h2><p>{book.author}</p><div>{book.pageCount} pages · {book.chapterCount} sections<br />{book.exerciseCount ? `${book.exerciseCount} training exercises` : `${book.diagramCount} imported diagrams`}</div><strong>Train & read →</strong></button>)}</div>
    {!books.length && !busy && <p className={styles.message}>Open your private delivery link or choose your prepared book packages below. Full books are kept in this browser, separate from the public samples.</p>}
    <section className={styles.import}><h2>Add complete books</h2><p>Select one or more prepared Chess Quest book packages. Each contains the complete PDF and its interactive diagram index. The files are stored on this device.</p><label className="btn">{busy ? 'Adding books…' : 'Choose book packages'}<input data-testid="full-book-import" type="file" multiple accept=".cquest,.zip" disabled={busy} onChange={e => void importFiles(e.target.files)} /></label><p className={styles.caption}>Keep the original packages as a backup. Books and reading marks do not yet sync between devices; open your private delivery link on each device you use.</p></section>
  </div>;
}

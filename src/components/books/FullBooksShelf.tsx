'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listFullBooks, PRIVATE_BOOKS_EVENT, type FullBookSummary } from '@/lib/private-books';

export default function FullBooksShelf() {
  const [books, setBooks] = useState<FullBookSummary[]>([]);
  useEffect(() => {
    const refresh = () => void listFullBooks().then(setBooks).catch(() => undefined);
    refresh(); window.addEventListener(PRIVATE_BOOKS_EVENT, refresh);
    return () => window.removeEventListener(PRIVATE_BOOKS_EVENT, refresh);
  }, []);
  return <section className="card mb-6 p-6" aria-label="Complete private books"><p className="eyebrow">YOUR COMPLETE BOOKS</p><h2 className="my-3 text-2xl">Full chapters. A board beside you.</h2><p className="mb-4 text-sm">{books.length ? `${books.length} full books saved on this device · ${books.reduce((count, book) => count + book.pageCount, 0)} pages. Read the lessons, work through the diagrams, and check the book’s answers.` : 'Open your full-book library or add your prepared private book packages. Complete PDFs and interactive boards stay together.'}</p><Link className="btn btn-primary" href="/books">Open full books →</Link></section>;
}

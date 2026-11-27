import { createStore, get, getMany, keys, setMany, update } from 'idb-keyval';
import { Chess, validateFen } from 'chess.js';
import type { SolNode } from './types';
import { unzip } from 'fflate';

export interface BookChapter { id: string; title: string; page: number; endPage: number }
export interface BookRegion { page: number; x: number; y: number; width: number; height: number }
export interface BookTraining { chapterId: string; answer: BookRegion[]; solution?: SolNode[] }
export interface BookDiagram {
  id: string; page: number; label: string; fen: string | null;
  x: number; y: number; width: number; height: number;
  confidence: number; needsReview: boolean; side: 'w' | 'b' | 'unknown';
  training?: BookTraining;
}
export interface FullBook {
  schema: 'chessquest/full-book@1'; id: string; title: string; author: string;
  pageCount: number; sha256: string; revision?: number; sourceNote?: string; chapters: BookChapter[]; diagrams: BookDiagram[];
}
export interface FullBookSummary {
  id: string; title: string; author: string; pageCount: number; diagramCount: number;
  chapterCount: number; sha256: string; revision?: number; exerciseCount?: number; addedAt: number;
}
export interface BookPractice { attempts: number; bookSolved: boolean; engineChecked: boolean; revealed: boolean; updatedAt: number }
export type BookPracticeEvent = 'attempt' | 'solved' | 'engine-checked' | 'revealed';
export interface ReadingProgress { page: number; completed: string[]; positions?: Record<string, string>; practice?: Record<string, BookPractice>; exercise?: string }
const database = () => createStore('chessquest-private-books', 'books');
export const PRIVATE_BOOKS_EVENT = 'chessquest:private-books';

/** Printed exercise pages are read down the left column, then the right. */
export function listBookExercises(book: FullBook): BookDiagram[] {
  return book.diagrams.filter(diagram => diagram.training).sort((a, b) =>
    a.page - b.page || Number(a.x >= .48) - Number(b.x >= .48) || a.y - b.y);
}

export function validateFullBook(raw: unknown): FullBook {
  const book = raw as FullBook;
  if (!book || book.schema !== 'chessquest/full-book@1' || !/^[a-z0-9-]{1,80}$/.test(book.id) ||
      typeof book.title !== 'string' || !book.title.trim() || book.title.length > 200 ||
      typeof book.author !== 'string' || !/^[a-f0-9]{64}$/.test(book.sha256) ||
      !Number.isInteger(book.pageCount) || book.pageCount < 1 || book.pageCount > 2000 ||
      !Array.isArray(book.chapters) || book.chapters.length > 150 ||
      !Array.isArray(book.diagrams) || book.diagrams.length > 4000) throw new Error('This is not a supported full-book package.');
  if (book.revision !== undefined && (!Number.isInteger(book.revision) || book.revision < 1)) throw new Error('Invalid book revision.');
  if (book.sourceNote !== undefined && (typeof book.sourceNote !== 'string' || book.sourceNote.length > 1000)) throw new Error('Invalid source note.');
  const ids = new Set<string>();
  for (const chapter of book.chapters) {
    if (typeof chapter.id !== 'string' || typeof chapter.title !== 'string' ||
        !Number.isInteger(chapter.page) || !Number.isInteger(chapter.endPage) || chapter.page < 1 ||
        chapter.endPage > book.pageCount || chapter.endPage < chapter.page) throw new Error('The chapter index is invalid.');
  }
  for (const diagram of book.diagrams) {
    if (typeof diagram.id !== 'string' || ids.has(diagram.id) || typeof diagram.label !== 'string' ||
        !Number.isInteger(diagram.page) || diagram.page < 1 || diagram.page > book.pageCount ||
        !['w', 'b', 'unknown'].includes(diagram.side) || typeof diagram.needsReview !== 'boolean' ||
        !Number.isFinite(diagram.confidence) || diagram.confidence < 0 || diagram.confidence > 1 ||
        [diagram.x, diagram.y, diagram.width, diagram.height].some(x => !Number.isFinite(x) || x < 0 || x > 1) ||
        diagram.width <= 0 || diagram.height <= 0 || diagram.x + diagram.width > 1.01 || diagram.y + diagram.height > 1.01 ||
        (diagram.fen !== null && (typeof diagram.fen !== 'string' || !validateFen(diagram.fen).ok))) throw new Error('A diagram in the package is invalid.');
    if (diagram.training) {
      const training = diagram.training;
      if (!book.chapters.some(c => c.id === training.chapterId) || !Array.isArray(training.answer) || !training.answer.length || training.answer.length > 16) throw new Error('The book answer index is invalid.');
      for (const part of training.answer) {
        if (!Number.isInteger(part.page) || part.page < 1 || part.page > book.pageCount ||
            [part.x, part.y, part.width, part.height].some(v => !Number.isFinite(v) || v < 0 || v > 1) ||
            part.width <= 0 || part.height <= 0 || part.x + part.width > 1.001 || part.y + part.height > 1.001) throw new Error('The book answer region is invalid.');
      }
      if (training.solution !== undefined) {
        if (!diagram.fen || !Array.isArray(training.solution) || !training.solution.length) throw new Error('The book move line is invalid.');
        let count = 0;
        const walk = (nodes: SolNode[], fen: string, depth: number) => {
          if (!Array.isArray(nodes) || depth > 150) throw new Error('The book move line is invalid.');
          const seen = new Set<string>();
          for (const node of nodes) {
            if (++count > 2000 || !node || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(node.uci) || typeof node.san !== 'string' || seen.has(node.uci)) throw new Error('The book move line is invalid.');
            seen.add(node.uci);
            const position = new Chess(fen);
            try {
              const move = position.move({ from: node.uci.slice(0, 2), to: node.uci.slice(2, 4), promotion: node.uci[4] });
              if (move.san !== node.san) throw new Error('Mismatched notation');
            } catch { throw new Error('The book move line is invalid.'); }
            walk(node.children, position.fen(), depth + 1);
          }
        };
        walk(training.solution, diagram.fen, 0);
      }
    }
    ids.add(diagram.id);
  }
  return book;
}

export async function listFullBooks(): Promise<FullBookSummary[]> {
  const store = database();
  const ids = (await keys(store)).filter(key => typeof key === 'string' && key.startsWith('meta:'));
  return (await getMany<FullBookSummary>(ids, store)).filter((item): item is FullBookSummary => !!item).sort((a, b) => a.id.localeCompare(b.id));
}
export async function loadFullBook(id: string) {
  const [book, pdf] = await getMany<FullBook | Blob>([`book:${id}`, `pdf:${id}`], database());
  if (!book || !(pdf instanceof Blob)) throw new Error('This book is not saved on this device. Import it again.');
  return { book: validateFullBook(book), pdf };
}
export async function saveFullBook(book: FullBook, pdf: Uint8Array) {
  validateFullBook(book);
  if (pdf.length > 160 * 1024 * 1024 || new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') throw new Error('The source PDF is missing or too large.');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(pdf)))).map(v => v.toString(16).padStart(2, '0')).join('');
  if (digest !== book.sha256) throw new Error('The source PDF does not match this book’s index. Nothing was imported.');
  const meta: FullBookSummary = { id: book.id, title: book.title, author: book.author, pageCount: book.pageCount, diagramCount: book.diagrams.length, chapterCount: book.chapters.length, sha256: book.sha256, revision: book.revision, exerciseCount: book.diagrams.filter(d => d.training).length, addedAt: Date.now() };
  // One transaction: a full book never appears without its PDF. Reimport does
  // not touch reading progress, corrections, or the existing exercise library.
  await setMany([[`meta:${book.id}`, meta], [`book:${book.id}`, book], [`pdf:${book.id}`, new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })]], database());
  window.dispatchEvent(new Event(PRIVATE_BOOKS_EVENT));
}
export const readBookProgress = async (id: string): Promise<ReadingProgress> => (await get<ReadingProgress>(`progress:${id}`, database())) ?? { page: 1, completed: [] };
export const saveBookPage = (id: string, page: number) => update<ReadingProgress>(`progress:${id}`, value => ({ ...value, page, completed: value?.completed ?? [] }), database());
export const markBookDiagram = (id: string, diagram: string, complete: boolean) => update<ReadingProgress>(`progress:${id}`, value => ({ ...value, page: value?.page ?? 1, completed: complete ? [...new Set([...(value?.completed ?? []), diagram])] : (value?.completed ?? []).filter(x => x !== diagram) }), database());
export const correctBookDiagram = (id: string, diagram: string, fen: string) => {
  if (!validateFen(fen).ok) throw new Error('Enter a valid FEN position.');
  return update<ReadingProgress>(`progress:${id}`, value => ({ ...value, page: value?.page ?? 1, completed: value?.completed ?? [], positions: { ...value?.positions, [diagram]: fen } }), database());
};

export const saveBookExercise = (id: string, exercise: string) => update<ReadingProgress>(`progress:${id}`, value => ({ ...value, page: value?.page ?? 1, completed: value?.completed ?? [], exercise }), database());
export const recordBookPractice = (id: string, diagram: string, event: BookPracticeEvent) => update<ReadingProgress>(`progress:${id}`, value => {
  const previous = value?.practice?.[diagram] ?? { attempts: 0, bookSolved: false, engineChecked: false, revealed: false, updatedAt: 0 };
  const practice: BookPractice = { ...previous, attempts: previous.attempts + (event === 'attempt' ? 1 : 0), bookSolved: previous.bookSolved || event === 'solved', engineChecked: previous.engineChecked || event === 'engine-checked', revealed: previous.revealed || event === 'revealed', updatedAt: Date.now() };
  return { ...value, page: value?.page ?? 1, completed: value?.completed ?? [], practice: { ...value?.practice, [diagram]: practice } };
}, database());

/** Keep the PDF and history; invalidate grades only when the practiced position changes. */
export async function updateFullBookIndex(raw: unknown, expectedId: string) {
  const book = validateFullBook(raw);
  const changed = await database()('readwrite', store => new Promise<boolean>((resolve, reject) => {
    let changed = false, failure: unknown;
    const tx = store.transaction;
    tx.oncomplete = () => resolve(changed);
    tx.onabort = tx.onerror = () => reject(failure ?? tx.error);
    const metadata = store.get(`meta:${expectedId}`);
    const previous = store.get(`book:${expectedId}`);
    const saved = store.get(`progress:${expectedId}`);
    saved.onsuccess = () => {
      try {
        const meta = metadata.result as FullBookSummary | undefined;
        if (book.id !== expectedId || !meta || meta.sha256 !== book.sha256 || meta.pageCount !== book.pageCount) throw new Error('This update does not match the saved source book.');
        if ((book.revision ?? 1) <= (meta.revision ?? 1)) return;
        const oldBook = previous.result as FullBook | undefined;
        const progress = saved.result as ReadingProgress | undefined;
        const oldPositions = new Map(oldBook?.diagrams.map(d => [d.id, d.fen]));
        if (progress?.practice) {
          const practice = { ...progress.practice };
          for (const diagram of book.diagrams) {
            if (practice[diagram.id] && !progress.positions?.[diagram.id] && oldPositions.get(diagram.id) !== diagram.fen) {
              practice[diagram.id] = { ...practice[diagram.id], bookSolved: false, engineChecked: false };
            }
          }
          store.put({ ...progress, practice }, `progress:${book.id}`);
        }
        store.put(book, `book:${book.id}`);
        store.put({ ...meta, revision: book.revision, diagramCount: book.diagrams.length, exerciseCount: book.diagrams.filter(d => d.training).length }, `meta:${book.id}`);
        changed = true;
      } catch (cause) { failure = cause; tx.abort(); }
    };
  }));
  if (changed) window.dispatchEvent(new Event(PRIVATE_BOOKS_EVENT));
}

export async function importBookPackage(data: Uint8Array, expectedId?: string) {
  if (data.byteLength > 170 * 1024 * 1024) throw new Error('This package is too large.');
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(data, {
    filter: file => ['book.json', 'source.pdf'].includes(file.name) && file.originalSize <= 160 * 1024 * 1024,
  }, (err, entries) => err ? reject(err) : resolve(entries)));
  if (!files['book.json'] || !files['source.pdf'] || files['book.json'].length > 5 * 1024 * 1024) throw new Error('A book package must contain its index and source PDF.');
  const book = validateFullBook(JSON.parse(new TextDecoder().decode(files['book.json'])));
  if (expectedId && book.id !== expectedId) throw new Error('The delivered book has an unexpected identity. Nothing was imported.');
  await saveFullBook(book, files['source.pdf']);
  return book;
}

const decodeKey = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function importPrivateDelivery(id: string, keyText: string, onProgress: (message: string) => void) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(keyText)) throw new Error('This private book link is incomplete.');
  const key = await crypto.subtle.importKey('raw', decodeKey(keyText), { name: 'AES-GCM' }, false, ['decrypt']);
  const base = `/private-import/${id}`;
  const response = await fetch(`${base}/delivery.json`, { credentials: 'omit' });
  if (!response.ok) throw new Error('This delivery link is no longer available. You can still import your saved book packages below.');
  const delivery = await response.json() as { version: number; books: { id: string; revision?: number; index?: { file: string; iv: string }; parts: { file: string; iv: string }[] }[] };
  if (![1, 2].includes(delivery.version) || !Array.isArray(delivery.books) || !delivery.books.length || delivery.books.length > 9) throw new Error('Invalid book delivery.');
  const saved = await listFullBooks();
  for (const [index, entry] of delivery.books.entries()) {
    if (!/^[a-z0-9-]{1,80}$/.test(entry.id) || !Array.isArray(entry.parts) || !entry.parts.length || entry.parts.length > 24) throw new Error('Invalid book delivery.');
    const existing = saved.find(book => book.id === entry.id);
    if (existing) {
      if (delivery.version === 1 || (existing.revision ?? 1) >= (entry.revision ?? 1)) continue;
      const part = entry.index;
      if (!part || !/^[a-z0-9-]+\.bin$/.test(part.file) || !/^[A-Za-z0-9_-]{16}$/.test(part.iv)) throw new Error('Invalid book update.');
      onProgress(`Updating exercises and solutions · book ${index + 1} of ${delivery.books.length}…`);
      const result = await fetch(`${base}/${part.file}`, { credentials: 'omit' });
      if (!result.ok) throw new Error('The update was interrupted. Reopen your private link to continue.');
      const encrypted = await result.arrayBuffer();
      if (encrypted.byteLength > 5 * 1024 * 1024) throw new Error('Invalid update size.');
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeKey(part.iv), additionalData: new TextEncoder().encode(`${id}/${entry.id}/index`) }, key, encrypted);
      await updateFullBookIndex(JSON.parse(new TextDecoder().decode(bytes)), entry.id);
      continue;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (const [partIndex, part] of entry.parts.entries()) {
      if (!/^[a-z0-9-]+\.bin$/.test(part.file) || !/^[A-Za-z0-9_-]{16}$/.test(part.iv)) throw new Error('Invalid book delivery.');
      onProgress(`Adding book ${index + 1} of ${delivery.books.length} · part ${partIndex + 1} of ${entry.parts.length}…`);
      const result = await fetch(`${base}/${part.file}`, { credentials: 'omit' });
      if (!result.ok) throw new Error('The download was interrupted. Reopen your private link to continue.');
      const bytes = await result.arrayBuffer();
      if (bytes.byteLength > 9 * 1024 * 1024) throw new Error('Invalid delivery size.');
      const chunk = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeKey(part.iv), additionalData: new TextEncoder().encode(`${id}/${entry.id}/${partIndex}`) }, key, bytes));
      size += chunk.length;
      if (size > 170 * 1024 * 1024) throw new Error('Invalid delivery size.');
      chunks.push(chunk);
    }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    onProgress(`Saving book ${index + 1} of ${delivery.books.length} on this device…`);
    await importBookPackage(data, entry.id);
  }
}

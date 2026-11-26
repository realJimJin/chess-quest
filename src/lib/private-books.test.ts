import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clear, createStore, get, set } from 'idb-keyval';
import { strToU8, zipSync } from 'fflate';
import { importBookPackage, importPrivateDelivery, listBookExercises, listFullBooks, loadFullBook, markBookDiagram, readBookProgress, saveBookPage, validateFullBook, type FullBook } from './private-books';

const pdf = strToU8('%PDF-1.7\nThis is a storage fixture, not a rendered document.');
const fixture = async (id = 'fixture-book'): Promise<FullBook> => ({
  schema: 'chessquest/full-book@1', id, title: 'Fixture', author: 'Test', pageCount: 3,
  sha256: Buffer.from(await crypto.subtle.digest('SHA-256', pdf)).toString('hex'),
  chapters: [{ id: 'first', title: 'Chapter 1', page: 1, endPage: 3 }],
  diagrams: [{ id: 'first-diagram', page: 2, label: 'Position 1', x: .1, y: .2, width: .3, height: .3, confidence: .95, needsReview: false, side: 'w', fen: '7k/8/8/8/8/8/8/KR6 w - - 0 1' }],
});
const pack = (book: FullBook, source = pdf) => zipSync({ 'book.json': strToU8(JSON.stringify(book)), 'source.pdf': source });
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
beforeEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  vi.stubGlobal('window', new EventTarget());
  await clear(createStore('chessquest-private-books', 'books'));
});

describe('private complete books', () => {
  it('trains in printed column order without changing the saved diagram index', async () => {
    const book = await fixture();
    const diagram = book.diagrams[0];
    const training = { chapterId: 'first', answer: [{ page: 3, x: .1, y: .1, width: .4, height: .4 }] };
    book.diagrams = [
      { ...diagram, id: 'ex-1', x: .1, y: .1, training },
      { ...diagram, id: 'ex-4', x: .6, y: .1, training },
      { ...diagram, id: 'ex-2', x: .1, y: .4, training },
      { ...diagram, id: 'ex-5', x: .6, y: .4, training },
      { ...diagram, id: 'ex-3', x: .1, y: .7, training },
      { ...diagram, id: 'ex-6', x: .6, y: .7, training },
      { ...diagram, id: 'example' },
      { ...diagram, id: 'ex-7', page: 3, training },
    ];
    expect(listBookExercises(book).map(d => d.id)).toEqual(['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5', 'ex-6', 'ex-7']);
    expect(book.diagrams[1].id).toBe('ex-4');
  });
  it('imports complete source and index together without touching the old library', async () => {
    await set('cst.library.v1', { keep: true });
    const book = await fixture(); await importBookPackage(pack(book));
    expect((await listFullBooks())[0]).toMatchObject({ id: book.id, pageCount: 3, diagramCount: 1 });
    expect(await (await loadFullBook(book.id)).pdf.text()).toBe(new TextDecoder().decode(pdf));
    expect(await get('cst.library.v1')).toEqual({ keep: true });
  });
  it('preserves reading page, marks and other books on reimport', async () => {
    const book = await fixture(); await importBookPackage(pack(book));
    await importBookPackage(pack(await fixture('second')));
    await saveBookPage(book.id, 3); await markBookDiagram(book.id, 'first-diagram', true);
    await importBookPackage(pack(book));
    expect(await readBookProgress(book.id)).toEqual({ page: 3, completed: ['first-diagram'] });
    expect(await listFullBooks()).toHaveLength(2);
  });
  it('rejects damaged source and wrong delivered identity before writing', async () => {
    const book = await fixture();
    await expect(importBookPackage(pack(book, strToU8('%PDF-changed')))).rejects.toThrow('does not match');
    await expect(importBookPackage(pack(book), 'wrong-book')).rejects.toThrow('unexpected identity');
    expect(await listFullBooks()).toEqual([]);
  });
  it('rejects malformed diagrams and missing source', async () => {
    const book = await fixture(); book.diagrams[0].width = 2;
    expect(() => validateFullBook(book)).toThrow('diagram');
    await expect(importBookPackage(zipSync({ 'book.json': strToU8('{}') }))).rejects.toThrow('source PDF');
  });
  it('decrypts a private delivery and never sends its key in requests', async () => {
    const id = 'dd2e8d36-6764-4966-978e-b91c3694a6fb', book = await fixture();
    const rawKey = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: strToU8(`${id}/${book.id}/0`) }, key, pack(book));
    const fetcher = vi.fn(async (url: string) => url.endsWith('delivery.json') ? new Response(JSON.stringify({ version: 1, books: [{ id: book.id, parts: [{ file: 'part.bin', iv: b64(iv) }] }] })) : new Response(encrypted));
    vi.stubGlobal('fetch', fetcher);
    await importPrivateDelivery(id, b64(rawKey), () => {});
    expect((await listFullBooks())[0].id).toBe(book.id);
    expect(fetcher.mock.calls.every(([url]) => !url.includes(b64(rawKey)))).toBe(true);
  });
  it('does not save ciphertext with a wrong key', async () => {
    const id = 'dd2e8d36-6764-4966-978e-b91c3694a6fb';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('delivery.json') ? new Response(JSON.stringify({ version: 1, books: [{ id: 'fixture-book', parts: [{ file: 'part.bin', iv: b64(new Uint8Array(12)) }] }] })) : new Response(new Uint8Array(100))));
    await expect(importPrivateDelivery(id, b64(new Uint8Array(32)), () => {})).rejects.toThrow();
    expect(await listFullBooks()).toEqual([]);
  });
});

it('validates answer bounds and rejects illegal book continuations', async () => {
  const book = await fixture();
  book.diagrams[0].training = { chapterId: 'first', answer: [{ page: 4, x: .1, y: .1, width: .4, height: .4 }] };
  expect(() => validateFullBook(book)).toThrow('answer region');
  book.diagrams[0].training.answer[0].page = 3;
  book.diagrams[0].training.solution = [{ uci: 'b1b8', san: 'Rb8+', children: [{ uci: 'h8h1', san: 'Kh1', children: [] }] }];
  expect(() => validateFullBook(book)).toThrow('book move line');
});
it('upgrades an existing book with only its encrypted index and preserves progress and PDF', async () => {
  const { correctBookDiagram, recordBookPractice, updateFullBookIndex } = await import('./private-books');
  const book = await fixture(); await importBookPackage(pack(book));
  await saveBookPage(book.id, 2); await markBookDiagram(book.id, 'first-diagram', true);
  await correctBookDiagram(book.id, 'first-diagram', book.diagrams[0].fen!);
  await recordBookPractice(book.id, 'first-diagram', 'revealed');
  const previous = await readBookProgress(book.id);
  const updated = { ...book, revision: 2 };
  updated.diagrams[0].training = { chapterId: 'first', answer: [{ page: 3, x: .1, y: .1, width: .4, height: .4 }] };
  const id = 'dd2e8d36-6764-4966-978e-b91c3694a6fb';
  const rawKey = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: strToU8(`${id}/${book.id}/index`) }, key, strToU8(JSON.stringify(updated)));
  const fetcher = vi.fn(async (url: string) => url.endsWith('delivery.json') ? new Response(JSON.stringify({ version: 2, books: [{ id: book.id, revision: 2, index: { file: 'index.bin', iv: b64(iv) }, parts: [{ file: 'large-book.bin', iv: b64(iv) }] }] })) : new Response(encrypted));
  vi.stubGlobal('fetch', fetcher);
  await importPrivateDelivery(id, b64(rawKey), () => {});
  expect(fetcher.mock.calls.map(([url]) => url)).toHaveLength(2);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('large-book.bin'))).toBe(false);
  expect((await loadFullBook(book.id)).book.revision).toBe(2);
  expect(await (await loadFullBook(book.id)).pdf.text()).toBe(new TextDecoder().decode(pdf));
  expect(await readBookProgress(book.id)).toEqual(previous);
  await expect(updateFullBookIndex({ ...updated, revision: 3, sha256: '0'.repeat(64) }, book.id)).rejects.toThrow('does not match');
});
it('keeps revealed, engine-checked and book-solved results distinct', async () => {
  const { recordBookPractice } = await import('./private-books');
  await recordBookPractice('fixture', 'one', 'revealed');
  await recordBookPractice('fixture', 'one', 'engine-checked');
  expect((await readBookProgress('fixture')).practice?.one).toMatchObject({ revealed: true, engineChecked: true, bookSolved: false });
  await Promise.all([recordBookPractice('fixture', 'one', 'attempt'), recordBookPractice('fixture', 'one', 'attempt')]);
  expect((await readBookProgress('fixture')).practice?.one.attempts).toBe(2);
});

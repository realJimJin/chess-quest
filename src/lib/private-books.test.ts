import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clear, createStore, get, set } from 'idb-keyval';
import { strToU8, zipSync } from 'fflate';
import { importBookPackage, importPrivateDelivery, listFullBooks, loadFullBook, markBookDiagram, readBookProgress, saveBookPage, validateFullBook, type FullBook } from './private-books';

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

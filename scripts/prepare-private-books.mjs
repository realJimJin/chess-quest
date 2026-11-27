/** Prepare encrypted, static delivery of user-supplied full-book packages.
 * Plaintext packages and the receipt/key must be outside the repository.
 * Usage: node scripts/prepare-private-books.mjs RECEIPT_PATH PACKAGE...
 */
import { randomBytes, randomUUID, createCipheriv } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
const [receiptPath, ...paths] = process.argv.slice(2);
if (!receiptPath || !paths.length || paths.length > 9) throw new Error('Provide a private receipt path and 1–9 book packages.');
for (const path of [receiptPath, ...paths]) {
  if (!relative(process.cwd(), resolve(path)).startsWith('..')) throw new Error('Keep original packages and the private receipt outside the repository.');
}
const id = randomUUID(), key = randomBytes(32);
const folder = `public/private-import/${id}`;
await mkdir(folder, { recursive: true });
const delivery = { version: 2, books: [] };
let encryptedBytes = 0;
for (const path of paths) {
  const bytes = await readFile(path);
  if (bytes.length > 170 * 1024 * 1024) throw new Error('Package exceeds the import limit.');
  const entries = unzipSync(bytes, { filter: f => f.name === 'book.json' && f.originalSize < 5 * 1024 * 1024 });
  const book = JSON.parse(strFromU8(entries['book.json']));
  if (book.schema !== 'chessquest/full-book@1' || !/^[a-z0-9-]{1,80}$/.test(book.id)) throw new Error('Invalid package index.');
  const indexIv = randomBytes(12), indexCipher = createCipheriv('aes-256-gcm', key, indexIv);
  indexCipher.setAAD(Buffer.from(`${id}/${book.id}/index`));
  const indexBytes = Buffer.concat([indexCipher.update(entries['book.json']), indexCipher.final(), indexCipher.getAuthTag()]);
  const indexFile = `${book.id}-index.bin`;
  await writeFile(`${folder}/${indexFile}`, indexBytes); encryptedBytes += indexBytes.length;
  const item = { id: book.id, revision: book.revision ?? 1, index: { file: indexFile, iv: indexIv.toString('base64url') }, parts: [] };
  for (let offset = 0, index = 0; offset < bytes.length; offset += 8 * 1024 * 1024, index++) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${id}/${book.id}/${index}`));
    const data = Buffer.concat([cipher.update(bytes.subarray(offset, offset + 8 * 1024 * 1024)), cipher.final(), cipher.getAuthTag()]);
    const file = `${book.id}-${index}.bin`;
    await writeFile(`${folder}/${file}`, data);
    item.parts.push({ file, iv: iv.toString('base64url') }); encryptedBytes += data.length;
  }
  delivery.books.push(item);
}
await writeFile(`${folder}/delivery.json`, JSON.stringify(delivery));
await writeFile(receiptPath, JSON.stringify({ id, key: key.toString('base64url'), urlPath: `/books#import=${id}&key=${key.toString('base64url')}`, bookIds: delivery.books.map(b => b.id) }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ id, books: delivery.books.length, encryptedBytes, receiptPath }));

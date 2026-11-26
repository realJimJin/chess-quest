# Private complete books

`/books` reads a user's complete PDF alongside a chess analysis board. It stores the source PDF, chapter index, extracted diagrams, reading page, studied marks, and local position corrections in the separate `chessquest-private-books` IndexedDB database. Reimporting a book preserves its progress and does not alter the existing exercise library.

This is an analysis reader. It does not grade a user's moves against a book's solution tree. Every source page, including answers and variations, remains readable. Scanned diagrams carry recognition warnings; legality validation alone does not establish that a scan was read perfectly. Side to move and castling permissions can be adjusted without editing a FEN.

## Import package

A `.cquest` file is a ZIP with exactly these useful entries:

- `book.json`: `chessquest/full-book@1` index, validated by `src/lib/private-books.ts`.
- `source.pdf`: unchanged user-supplied PDF, checked against the SHA-256 in the index.

The reader checks package size, schema, diagram coordinates and FENs before storing a source/index pair in one transaction. Files stay on the device and are not part of account sync. Keep the original packages as backups; opening a private delivery link on another device imports a separate copy.

## Encrypted delivery

For a user-authorized web delivery, keep packages and the receipt outside the repository and run:

```sh
node scripts/prepare-private-books.mjs /private/path/receipt.json /private/path/book.cquest
```

The script creates AES-256-GCM encrypted chunks under the ignored `public/private-import/<random-id>/` directory. Every chunk has a fresh random IV and authenticated delivery/book/part identity. Only ciphertext, IVs and book IDs are deployed. The 32-byte key stays in the private receipt and the import URL fragment, which is not sent in HTTP requests. The reader removes the fragment after import. Never commit a receipt, a complete book, extracted full-book content, or a delivery link.

The ciphertext is deployment-local and is intentionally not in Git. Preserve the encrypted directory privately if a subsequent deployment must continue serving the same link. Existing imported books remain readable if the delivery disappears. Delete an expired delivery from subsequent deployments rather than changing or deleting a user's local library.

`postinstall` copies the PDF.js runtime, CMaps, fonts, WASM and license. `scripts/build-ios.sh` temporarily excludes the web reader, PDF runtime and private deliveries from the public iOS export.

## Verification

Unit tests cover corrupt/wrong-identity package rejection, transactional storage, preserved progress and existing library data, encrypted delivery, wrong keys, legal analysis, underpromotion, keyboard navigation, persistence errors and castling permissions. Release verification must also import actual large packages in an isolated browser and render first, middle and last source pages on phone and desktop layouts. Inspect the upload file list before deployment to confirm it contains neither original books nor the private receipt/key.

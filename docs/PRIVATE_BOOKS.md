# Private complete books

`/books` stores a user's complete PDF, chapter index, extracted diagrams and progress in the separate `chessquest-private-books` IndexedDB database. Reimport and index upgrades preserve study marks, position corrections, attempts and the existing exercise library. Full books and their extracted content are private, outside Git and account sync.

## Training and reading

Indexed exercises open in training mode. The player receives move feedback, can retry or request a hint, and can reveal the original PDF answer region(s). Answers stay hidden until revealed. Chapter and exercise controls include final tests; next/previous exercise resets the board and hides the previous answer. The full reader remains available with analysis, zoom, page navigation and local position corrections.

An optional verified `training.solution` move tree is replayed legally and automatically supplies the opponent's first listed reply. A completed stored line is recorded separately from an engine-checked move. The book's original answer includes its full printed variations, explanation and scoring; the app does not claim that completing one stored line earns the book's full score.

For positions without a verified move tree, and for alternative moves, Stockfish compares the played move with its best move or the stored book move at depth 16. Feedback is explicitly labeled as engine feedback, never as the author's answer. An engine-approved move is not marked as a solved book exercise. After a checked move, Continue against engine supplies an opponent reply so the user can keep practicing; subsequent player moves are checked too. Hints/reveals are recorded independently and an assisted attempt cannot earn a book-line completion. Engine failures are ungraded and retryable. A timed-out worker is discarded before the next request to avoid stale scores.

Recognition of a scan is not proven by FEN legality. Source diagrams remain accessible beside correction controls, including side to move and castling rights. Changing a starting position disables the stored book tree unless it exactly matches that tree's original FEN. Corrections are device-local.

## Import package

A `.cquest` file is a ZIP containing:

- `book.json`: `chessquest/full-book@1` index, validated by `src/lib/private-books.ts`.
- `source.pdf`: unchanged user-supplied PDF, checked against the index's SHA-256.

The optional index `revision` enables upgrades. Each `BookDiagram.training` contains its chapter ID, normalized answer-page regions, and optionally a verified `SolNode[]` move tree. Validation checks answer bounds and every tree branch, including promotion and notation, before writing. These private indexes must never be committed to the public repo.

The reader validates package size, schema, coordinates, FENs and original PDF digest before storing the source and index in one transaction. Books remain on the device. Keep original packages as backups; a private delivery link imports a separate copy on each device.

## Encrypted delivery

Keep packages and the receipt outside the repository:

```sh
node scripts/prepare-private-books.mjs /private/path/receipt.json /private/path/book.cquest
```

The script creates AES-256-GCM ciphertext under the ignored `public/private-import/<random-id>/`. Each chunk and index has a fresh IV and authenticated delivery/book/part identity. Only ciphertext, IVs and book IDs are deployed. The 32-byte decryption key stays in a private receipt and URL fragment; it is never sent in an HTTP request. The fragment is removed after import. Never commit a receipt, complete book, extracted full-book content, or delivery link.

Version 2 deliveries include an independently encrypted index. Existing books download only that small index, checked against the saved source hash, and preserve their PDF and progress. New devices import the complete package. Version 1 links remain compatible. Reopening a new private link is required to upgrade an older imported index: previous import keys are deliberately not retained.

The encrypted directories are deployment-local, outside Git. Preserve older deliveries if their links must remain usable. Already imported books remain readable if a delivery disappears. Do not delete a user's local library when retiring a delivery.

A shared PDF.js document renders source pages and exact answer excerpts without loading a separate full PDF for each crop. `postinstall` copies the PDF runtime, fonts, CMaps, WASM and license. `scripts/build-ios.sh` excludes the web books route, PDF runtime and private deliveries from public iOS exports.

## Verification

Tests cover package and tree validation, encrypted import and index upgrades, preserved source/progress, legal book moves, automatic replies, inferior alternatives, engine-only feedback, promotions, keyboard replay, hidden/revealed answers, assisted scoring, stale engine replies and save failures. Release checks also import the actual large packages in an isolated phone/desktop browser, exercise the real Stockfish worker, render answer excerpts across all books and final tests, and verify original full-page reading still works. Audit the upload file list for original PDFs, packages and private receipts/keys before deployment.

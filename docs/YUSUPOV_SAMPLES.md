# Yusupov Fundamentals companion

Route: `/studies/yusupov-fundamentals`. Entry point in the web library.

This is a limited companion, **not the three complete books**. It contains nine
selected positions (three per book), sixteen replay lines, and short original
Chess Quest notes. The source PDFs, scans, chapter prose, full exercise sets,
and publisher scoring tables are not bundled. The sample IDs end in `-samples`
to avoid collisions with privately imported full-book collections.

## Sources checked on 2026-11-25

| Book, in reading order | Official excerpt | Included diagrams | PDF pages (1-based) |
| --- | --- | --- | --- |
| Build Up Your Chess 1 — The Fundamentals | https://www.newinchess.com/media/wysiwyg/product_pdf/Build-up-Your-Chess-1-exceprt.pdf | Chapter 21: diagrams 21-1, 21-3, 21-6 | 4, 5, 6 |
| Boost Your Chess 1 — The Fundamentals | https://www.newinchess.com/media/wysiwyg/product_pdf/Boost-Your-Chess-1-excerpt.pdf | Chapter 1: diagrams 1-1, 1-2; exercise 1-3 | 3, 4, 6 (solution on 8) |
| Chess Evolution 1 — The Fundamentals | https://www.newinchess.com/media/wysiwyg/product_pdf/Chess-Evolution-1-excerpt.pdf | Chapter 3: exercises 3-1, 3-2, 3-5 | 7 (solutions on 9) |

SHA-256 of the inspected excerpts:

```
build      442221734094ea17030b91da775519947ae5aa8cc3e29076ebb7d44d1cf22557
boost      ad8e4c0e4930cb6fcad4c05a771d745091f51b2bec61d3e8bf79c89ffd67b318
evolution  7b86b2970bad9f6f13292e78ea50b88f1fbf0cf7d25aaa133c1b8411bd615656
```

All nine diagrams were visually checked against rendered PDF pages. All stored
branches pass chess.js legality checks. `verified` here means the board and
stored moves were checked; `engine` remains null. It does not certify that every
best defensive move or every winning alternative has been included.

Smyslov–Euwe is explicitly marked as an analysis line. Emmrich–Moritz is marked as
a missed continuation. Tarrasch–Lasker is an equalizing combination, not a win.
The Lasker example retains the knight promotion and both alternative king replies.

## Complete editions

No authorized free full PDF was located. Authorized interactive editions are
listed by ChessTempo at:

- https://chesstempo.com/chess-books/build-up-your-chess-1-fundamentals/book/839
- https://chesstempo.com/chess-books/boost-your-chess-1-fundamentals/book/993
- https://chesstempo.com/chess-books/chess-evolution-1-fundamentals/book/994

Those purchases are separate from Chess Quest and do not provide an automatic
import or permission to republish the books here. Full-book conversion remains
dependent on a user-supplied authorized copy and a validated private import.

## Behavior and validation

- Replay: forward/back, first/last, arrow keys, clickable moves, autoplay,
  alternative lines, and board flip. Reading does not alter practice scores.
- Practice: save the selected sample pack before opening the existing trainer;
  play one position or all three, with hints and progress stored on the device.
- A failed save keeps the user on the study and allows a real persistence retry.
- Existing private collections and practice attempts survive adding all three packs.
- Unit/component checks validate all branches, mating endpoints, underpromotion,
  navigation, storage failures, and correct training destinations.
- Isolated Chrome checks cover 390px and 1440px layouts, keyboard and autoplay,
  all three practice queues, touch knight promotion, reload persistence, existing
  library preservation, and absence of browser exceptions.

The iOS export already removes the `studies` routes; this update is for the web app.

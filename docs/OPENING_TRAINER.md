# Offline opening trainer — iOS build 3

The Openings tab adds eight game-based lines from Alisa Genrietta Yunker's public game scores. Three train White, five train Black. All moves and original teaching notes ship in the app; no account, engine download, or network connection is needed to practice. Source links need internet access.

## Behavior

- Learn: shows the next move, highlights its starting square, and offers a board demonstration.
- Practice: hides future moves, automatically plays the opponent, and accepts the recorded move for the user's side. A legal alternative is described as different from the source game, not as a chess error.
- Touch: tap two squares or drag; keyboard SAN/coordinate entry is also available.
- Completion: scores unique positions that needed a hint or retry, supports replay and revisiting missed positions, and saves completed practice runs. Guided and unfinished sessions are ungraded.
- Review: an imperfect run stays due; consecutive clean runs schedule reviews after 1, 3, 7, and 14 days. This is an in-app due list, not a notification service.
- Progress uses the `OpeningProgressStore` interface and a separate `cq.openings.v1` local adapter. It does not alter the tactics, library, or Claude cloud interfaces. Failed reads preserve existing data; failed writes retain the in-memory result with a retry control. Cloud opening sync and resuming unfinished drills are not implemented.

## Source and scope

`src/lib/openings/catalog.ts` contains a direct source-game link for every line. Opening moves were checked against the visible game replay on November 21, 2026, then replayed through chess.js in tests. The opening excerpts are specific recorded choices, not a complete repertoire, an engine-approved best-move course, or an endorsed product. The prose notes are original Chess Quest commentary. The Four Pawns example begins as a King's Indian and transposes into a Modern Benoni; the fianchetto Black example starts with a Slav move order. No unsupported frequency claims from the supplied summary are presented in the app.

## Validation

140 tests pass, including every opening's legal replay, both colors, opponent-turn input rejection, illegal and alternative moves, honest assistance grading, progress round trips, malformed storage, UI completion, reload persistence, failed-save retry, and cancelling pending opponent replies on line changes.

The exported iOS app was exercised locally at 393 × 852: a Black-side Caro-Kann practice used actual board taps, a legal alternative, SAN entry, automatic replies, completion, and reload persistence. No console errors were observed. Static export checks include the Openings navigation, route, CSS module classes, and the synchronized Capacitor page. Native archive, simulator, and TestFlight evidence is kept with the build 3 release artifacts outside the source tree.

Release branch: `codex/ios-opening-trainer`. This work must not be merged to `main` without the user's instruction.

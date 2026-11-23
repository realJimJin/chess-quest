# Philidalphia national congress

Web study: `/studies/philidalphia-national-congress`, linked from Library and Openings. The title preserves the requested spelling.

The study contains 55 chapters: 27 original Yunker games and 28 opponent/earlier-Jim-game references. Yunker practice covers 222 opening decisions on her side. Full recorded Yunker games are available in replay mode; reference chapters retain the researched excerpts. Every chapter links to its original source and shows identity confidence. Unknown opponent repertoire remains explicitly unknown.

The Benko chapters include her recorded 5.b6, 5.e3, and 5.bxa6 choices. These games establish that she played each move, not that any is her exclusive or preferred repertoire. The 5.b6 game was independently rechecked against the public November 2026 Chess.com archive during this update.

## Source checks

`CONGRESS_SOURCE_AUDIT.json` records the original file hash and individual game hash for every Yunker chapter. The generator checks original cached Chess.com archives or Lichess broadcast PGNs, confirms her linked account/FIDE identity and color, replays every move, and compares the existing corpus. It retains original move orders. Three coaching-only chapters were excluded, and three previously rearranged move orders were restored. Opponent move-prefix counts are recomputed rather than treating transpositions as identical sequences.

To regenerate from the private research output directory:

```sh
node scripts/build-congress-study.cjs /path/to/outputs
```

Only factual moves and original teaching notes are exported; third-party clock/engine annotations are omitted. The selected games do not claim exhaustive coverage of her repertoire or establish optimal engine play.

## Interaction and progress

Replay supports buttons, clickable notation, board flipping and left/right keys (excluding editable controls). Practice accepts moves on the actual Chessground board or SAN/coordinate entry. It supplies opponent replies and awards recall credit only to correct, unaided moves. Hints, reveals and retries do not earn credit. Reviewing earlier positions pauses move entry until the learner returns to the current question.

Recall is stored on the current device under a separate study key; it does not overwrite book, opening or account progress. Unreadable data is left untouched, and failed writes can be retried. Chapter links use URL fragments. This update does not add cross-device study-progress sync.

The personal study route and PGN download are excluded by the iOS build script; this change publishes the requested web study, not an App Store update.

## Validation

- Source audit: 27 games from 20 original archive/broadcast files; all original move orders preserved.
- PGN import/replay: all 55 chapters legal.
- Real board DOM tests: move navigation, arrow keys, board flip, White/Black practice, SAN/UCI entry, hints, reveals, assisted scoring, chapter filters and storage failures.
- Complete project suite: 223 tests passed across 22 files.
- A browser layout/device test is separate from these DOM checks.

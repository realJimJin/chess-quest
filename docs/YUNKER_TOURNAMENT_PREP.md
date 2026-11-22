# Alisa Yunker preparation — verified game expansion

Checked November 22, 2026. Branch: `codex/yunker-tournament-prep`, based on build 4 (`dad07dbf`). No merge to main. Apple build 3 remains in review as requested.

## What is included

1,059 legal, deduplicated standard-chess games: 86 public Lichess tournament-broadcast games and 973 public Chess.com games from the account linked by her Chess.com master profile. 530 games as White and 529 as Black. Dates range from December 21, 2022 to November 18, 2026; tournament coverage is a smaller, older sample. All 39 returned Chess.com monthly archives were fetched. 86 publicly linked broadcast rounds were fetched (87 records, one duplicate).

| Color | Pool | Games | Distinct sequences through move 12 | Source opening labels |
|---|---|---:|---:|---:|
| White | tournament | 44 | 44 | 30 |
| White | all | 530 | 530 | 432 |
| Black | tournament | 42 | 42 | 25 |
| Black | all | 529 | 528 | 326 |

These are sample counts, not all her lifetime games or theoretical variations. The tree stops at the selected 8/12/15/20 full moves or the recorded end. Shorter prefixes are included in sequence counts. Transpositions merge identical positions; an exploration path may combine moves from different source games. Every edge has source-game evidence, not an invented continuation.

## Training behavior

- The five day buttons now open a dedicated guided board lesson, move focus to its heading and bring it into view. Previously they silently changed filters lower on the same page.
- 21 guided, sourced examples cover White's QGD, Slav, QGA, English, Nimzo, King's Indian, Sämisch, Four Pawns and Grünfeld; Black's Caro-Kann branches, Slav and flank responses. Day 5 reviews eight of those examples with both colors.
- Watch mode demonstrates moves on the actual chessboard, draws arrows, explains each learner move and supports stepping backward/forward or pausing autoplay. Practice mode hides the moves, plays the opponent automatically, handles hints/retries and stores the result using the existing opening-progress interface.
- Guided examples are a teaching selection. The full 1,059-game variation explorer remains available. No claim is made that every source game has manually authored teaching commentary.
- Defaults to 2025–2026 tournament broadcasts; filters add online rapid/blitz or all games including bullet/daily.
- White/Black, opening family, specific named variation, period and depth filters.
- Learn mode exposes every recorded move and sample count; the user can choose both sides' moves. It does not grade learning as recall.
- Recall mode hides moves, plays weighted opponent replies, accepts every recorded choice and repeats unrecorded attempts without calling them chess mistakes.
- Sample coverage, source links for the last move, and a five-day study sequence.
- Full factual source games downloadable as PGN; no third-party commentary or engine annotations.
- Imported PGNs stay supported. Prior imported data and old progress are not erased. Verified-drill progress has a separate browser-local key.

## Sources and identity

- https://www.chess.com/games/alisa-genrietta-yunker — links the account and FIDE 55724353.
- https://api.chess.com/pub/player/yunker_alisa/games/archives — public account archive, fetched serially with an identifying user agent.
- https://chessco.org/en/p/yunker-alisa-genrietta-fide-55724353 — discovery index of public tournament broadcast links. Final moves were fetched directly from Lichess round PGNs.
- Individual game source URLs are stored with every record and shown in the trainer. Broadcast identity is checked using FIDE 55724353 and/or the full name, not the surname alone.
- https://www.youtube.com/@yunkerchessbyarke — channel checked via TinyFish; titles were research leads only. Video moves were not transcribed or silently added. The channel includes both Alisa and German.

The existing 24-line standard-theory starter is no longer the default or presented as her verified repertoire. Eight guided model-game lessons remain available separately.

Opening-family classification also now requires whole family names: a Dutch or King's Gambit is not a Queen's Gambit; the French Tarrasch is not a QGD; the King's Indian Attack is not the King's Indian Defense; “Yugoslav” does not match “Slav”. This corrects 56 family labels without changing source moves or game counts.

## Processing and exclusions

27 nonstandard variants, four very short/ambiguous/starting-position records and one duplicate were excluded; no PGN parse failures remain. Broadcast textual headers sometimes have malformed quotes and trailing engine comments. The converter reads headers separately, strips comments, validates every factual move with chess.js, and normalizes decorative quotation marks in downloadable PGN headers. It does not repair or guess moves. Tournament clock fields can be inconsistent; unknown time classes are labeled unspecified instead of inferred from numbers such as 60+30.

`YUNKER_CORPUS_MANIFEST.json` records source file hashes and exclusions. Rebuild normalized records and the PGN with `node scripts/build-yunker-corpus.mjs <cached-source-directory>` (subfolders `broadcasts/` and `chesscom-archives/`). Raw public-source cache is retained in this chat's `outputs/yunker-tournament-prep/`.

## Validation

Validation includes every normalized opening's legality, every full-game PGN's re-import, source identity, direct broadcast fixtures, both-color practice and repeated-position frequencies. Guided-lesson regression checks cover all five day buttons, focus/scroll, exact source moves, coaching-note coverage, the actual Chessground board and SVG arrows, demonstration pause/cancel, full recall with scoring, keyboard entry and mixed-color review. A full-corpus test exceeded its old 20-second limit when run concurrently with the iOS build; its per-move assertion overhead was removed and the data audit has a 60-second budget. The final suite runs with two workers, separately from the build.

All 212 tests pass across 20 suites. TypeScript and lint pass. The iOS static export, Capacitor sync and UI export checks pass; generated pages include the guided lessons, expanded repertoire and full PGN. Preview publication is tracked in the chat's output report. No real-device or visual-browser test is claimed while computer control is unavailable. Native TestFlight availability is separate from this preview update.

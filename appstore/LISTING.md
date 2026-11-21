# Chess Quest — App Store listing draft

Copy these into App Store Connect. Character limits are Apple's.

## Name (30)
Chess Quest: Calculation

## Subtitle (30)
Train deep chess calculation

## Promotional text (170)
Turn chess exercises into a campaign. Solve on the board, think in Deep Calculation with the pieces locked, and let missed puzzles come back until they stick.

## Description (4000)
Chess Quest is a calculation trainer for players who want to get stronger over the board, not faster at tapping.

A JOURNEY THROUGH YOUR LIBRARY
Your exercises become a beautifully illustrated map. Each milestone is a real level, and the road ahead opens as you work through your collection.

SOLVE ON A REAL BOARD
Drag or tap the pieces. Legal moves, promotions, castling and en passant all work as they should. Play the whole line, not just the first move.

DEEP CALCULATION
For serious positions, the board locks. Set a thinking time, write down your candidate moves and variations, commit to one answer, then compare it with the solution.

ALTERNATIVE MOVES ARE CHECKED, NOT PUNISHED
If your move differs from the stored solution, the built-in Stockfish engine checks it. An equally strong move counts as correct.

MISTAKES COME BACK
Missed puzzles return on a spaced schedule: after 1, 3, 7, 16, 35 and 80 days.

SEE WHAT TO WORK ON
The coach sorts your misses into six kinds of error, using only what you recorded: your written lines, your clock and your own notes. It does not guess.

BRING YOUR OWN EXERCISES
Chess Quest includes a small pack of original sample puzzles. To train from a book you own, convert it with the free desktop tool and import the exercise file from Files.

PRIVATE BY DESIGN
No account. No ads. No tracking. Everything stays on your device.

OPEN SOURCE
Chess Quest is free software under the GNU GPL v3. Source code: github.com/realJimJin/chess-quest

## Keywords (100, comma-separated, no spaces)
chess,tactics,puzzles,calculation,training,combinations,checkmate,trainer,stockfish,endgame

## Category
Primary: Games — Board. Secondary: Education.

## URLs
- Support URL: https://chess-school-trainer.vercel.app/support
- Privacy Policy URL: https://chess-school-trainer.vercel.app/privacy
- Marketing URL (optional): https://chess-school-trainer.vercel.app

## Copyright
2026 Guixuan Jin

## App Privacy
Data Not Collected.

## Age rating
4+ (answer "None" to every content question).

## Export compliance
No non-exempt encryption. The build already declares this, so Apple should not ask.

## App Review notes
Chess Quest is a chess calculation trainer. No sign-in is required.

To review version 1.0, build 2:
1. Launch the app. Library opens with The Starter Collection, containing eight original puzzles. Tap Start studying to begin. No account or import is needed.
2. Move pieces by tapping a piece and then its destination, or use the notation field below the board. The first puzzle's solution is Rd8#.
3. Open Calculate in the training screen, or Calculate beside Sample puzzles in Library. Open the calculation notebook, enter candidates, variations and your first move, then commit it.
4. Journey displays the collection's illustrated level map and actual completion. Training creates a study plan from recorded practice. Coach and Profile are linked in the footer.
5. After revealing a solution, Try again provides practice without replacing the original attempt or awarding extra XP.

This release contains solo training only. Multiplayer previews, account sign-in and cloud sync are not part of the iOS app.

Importing your own exercises (Library > Import a book) reads a JSON file from Files and stores it on the device only. The app makes no network requests and collects no data.

Chess Quest is open source under the GNU GPL v3 (or later). The full source is public at https://github.com/realJimJin/chess-quest/tree/v1.0-build2, and the license notice is on the Support & license screen, linked from the bottom of every screen. It includes the chessground board and the Stockfish engine, both GPL v3.

## Before you submit
- The support page shows jimjin135@gmail.com as the contact address.
- "AI Coach" is rule-based, not a language model. If Apple questions the label, rename the tab to "Coach".
- GPL: the app is GPL-3.0-or-later. The GitHub repo must be public before the app goes live, and each release should be tagged (for example v1.0-build1) so the exact source of every build stays available.

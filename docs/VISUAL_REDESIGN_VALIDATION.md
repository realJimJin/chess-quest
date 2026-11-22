# Scholar’s Atlas redesign — November 21, 2026

Historical: this skin was replaced by the user-approved Figma AI export.
See [current implementation and validation](FIGMA_MAKE_INTEGRATION.md).

Branch: `codex/integration-core-redesign`. Review against `codex/visual-redesign`.
Do not merge to `main` or promote this preview to production.

## Result

The library uses a paper surface, editorial Cormorant Garamond headings, a forest
feature panel, upright book covers and a quieter chapter list. The journey uses
full landscape artwork, numbered waypoints and a separate study rail. Training
and the Book Battles preview share forest, parchment and muted gold colors.
Phone navigation and study controls remain usable without horizontal scrolling.

The app uses actual collections, chapter counts, saved progress and legal puzzle
positions. No illustrative Figma catalog, invented progress or fabricated match
results were added. Battles remains explicitly labeled as a design preview;
its solo-practice action opens the actual selected original puzzle.

Design reference: [Chess Quest — The Scholar’s Atlas](https://www.figma.com/design/VCwKvQU99EGFgUCyjkHJWi/Chess-Quest?node-id=4-394).
The saved design guided this implementation. Figma’s Starter tool limit prevented
additional edits to the draft, so its contrast and alignment corrections were
applied in the app. The Figma file is not a pixel-exact final source yet.
Cormorant Garamond is bundled by Next’s font loader, with no runtime Google Fonts
request. Existing map artwork and chess assets are reused.

## Browser verification

All browser testing ran locally. The session began with an empty library on
`127.0.0.1:3014`; original samples were added through Start studying. Existing
user storage was not cleared. The optimized static iOS export was served locally
for the final checks. Phone and iPad are viewport checks, not physical devices.

- Desktop 1280 × 720: library hierarchy, search and clear-search, journey artwork,
  navigation and saved progress.
- Phone 390 × 844: library, map action bar, playable board, battle preview;
  no horizontal overflow in the checked library and Battles layouts.
- iPad 1024 × 1366: shelf/chapter arrangement, map rail, calculation notebook,
  Battles board and training plan.
- Start studying imports the original collection and opens its training queue.
- Typed `Rd8#` completes the first puzzle; its completion appears in the library
  and map. Direct board taps on d1 and d8 also complete the same position.
- Deep Calculation opens from the map with the remaining unsolved positions.
  Candidate/variation/evaluation entries and `Rd1#` submission complete the next
  puzzle through the actual grader; the map then shows two completed positions.
- Claude’s training recommender displays actual attempts and opens its exact
  one-position recommendation in the calculation room.
- My imports displays the correct empty state; All collections restores the shelf.
- Battles Collection → Lobby → Match → Results transitions work. Invitations,
  scoring and timers remain unavailable; Study the position solo opens the correct
  single exercise. Smaller-screen match spacing was tightened after inspection.
- The final exported browser session reported no console errors.

A browser check caught that `/library/` selected the dark theme, because the iOS
export uses trailing slashes. The shell now normalizes the pathname before theme
and navigation selection. Five regression cases cover root, web library, exported
library, exported training and exported journey addresses. The rebuilt export was
checked again: `/library/` has the paper theme and Library selected.

## Automated verification

| Check | Result |
| --- | --- |
| JavaScript suite | 111 passed across 7 files (including 17 DOM integration cases) |
| TypeScript | Passed during the optimized build |
| Targeted ESLint | Passed for changed components and integration tests |
| Whitespace check | Passed |
| iOS static export and Capacitor sync | Passed, all 15 generated pages |
| Export integrity checks | Passed: CSS modules, notebook styles, map asset, native copies |

The extraction/database logic was not changed by this visual increment. Its
previous validation and limitations remain in `INTEGRATION_VALIDATION.md`.

## Remaining release work

No signed native build was produced and no App Store submission was made by this
increment. Real-device/TestFlight checks remain open. Auth, cloud transport,
hosted extraction and actual multiplayer services are not implemented by this
skin change. No hosted migration or production promotion was performed.

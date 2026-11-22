# Figma Make skin and current core integration — November 21, 2026

Branch: `codex/integration-core-redesign`. Review into `codex/visual-redesign` only.
No merge to main, production release, hosted migration, or App Store submission.

## Source and scope

The skin comes from the user-approved [Figma AI redesign](https://www.figma.com/make/KAi31oCFOf9cHvJtZiYeZk).
The generated project was downloaded with Figma’s normal Download code control.
The connector does not support Make sessions and its design-context call was
limited by the account’s plan. No plan upgrade or connector workaround was used.

The exported DM Sans typography, navy/gold palette, navigation, engraved starter
cover, academy artwork, library composition, map landmarks, and Battles match
layout are adapted to the existing Next application. `journey.png` is the exported
artwork; `starter-cover.svg` is the export’s static cover drawing. The real app’s
complete chess piece set, chess rules, engine, eight original puzzles and private
collections remain in use. The prototype’s single-puzzle logic is not used.

This replaces the rejected Scholar’s Atlas styling described in the older
`VISUAL_REDESIGN_VALIDATION.md`. No Figma catalog entries, progress totals,
opponents, scores or live timers are presented as real data.

Claude’s uncommitted core work was copied into an isolated source snapshot and
compared with the earlier `fec08f1` snapshot. Its live worktree was not modified.
The snapshot was checked against the live files again after browser testing; no
files had changed. Newly integrated services are `src/server/sync.ts`,
`src/server/users.ts` and `src/server/__tests__/sync.test.ts`. Claude’s retry flow
and daily-goal explanation deduplication were ported while retaining the prior
integration fixes for progress storage, account ownership and recommendations.

## Behavior

- Library filters/search select actual imported collections. Chapter actions open
  the selected book and chapter. The original collection is saved only after an
  explicit study action; visiting the library does not create stored content.
- Journey completion, level locks, free roam, selected collection and launch
  actions use actual campaign data. Longer books paginate through real levels.
- Training retains mouse/tap moves, keyboard notation, calculation notes, hint
  grading, Stockfish alternative-move checks, review scheduling and session totals.
- Try again restarts the position for practice. It leaves the original graded
  attempt and review schedule unchanged and awards zero additional XP.
- Battles defaults to its match preview, with Collection, Lobby and Results
  views available. Solo practice opens the chosen real position and mode. Preview
  navigation and scratch notes create no attempts or results.
- Sync services implement idempotent pushes, cursor pagination, resets, SRS
  rebuilding and profile conflicts. Account creation requires a verified identity
  supplied by a future authenticated caller. These services are tested directly;
  authentication routes and browser-to-server sync transport are not enabled.

## Validation

| Check | Result and limits |
| --- | --- |
| Full JavaScript suite | 124 passed across 8 files, including 21 DOM integration cases |
| Extraction/audit | 15 passed, 1 skipped; skip requires a private preview PDF |
| TypeScript | Passed |
| Targeted ESLint and whitespace | Passed |
| Production web build | Passed, including TypeScript and page generation |
| iOS static export / Capacitor sync | Passed, all 15 generated pages; no signed binary |
| Export integrity | Passed: CSS modules, notebook styles, map artwork and native web copies |
| Browser | Local desktop 1440×1080, phone 390×844, iPad 820×1180 |

One full-suite run overlapped the development compiler and exceeded two 10-second
database setup timeouts. After stopping the development server, the unchanged
full suite passed. The embedded database tests validate restricted roles and
account separation; they do not establish hosted database configuration.

Real browser checks used a fresh local origin on port 3015 without clearing the
user’s other app data. Verified:

- Library search/clear search, study launch, actual completion counts and reload
  persistence; progress increased only through real training.
- Desktop d1→d8 board taps solve the first puzzle. Phone d8→d1 taps solve the
  second position with black orientation and correct pointer geometry.
- A legal alternative (`Rd7`) is evaluated by the actual browser Stockfish worker
  and reported as winning but weaker than the stored mate, without a false error.
- Revealing a solution, using Try again, and solving it shows zero XP and keeps
  the original attempt. Automated checks additionally compare the entire saved
  progress and review schedule before/after the retry.
- Phone calculation candidates, variation, evaluation and first-move submission
  solve through the existing grader with the board locked during analysis.
- Journey opens the selected level’s remaining positions. The recommended
  session opens its exact single exercise in calculation mode.
- Battles Collection → Lobby → Match → Results, calculation scratch notes and
  solo-practice launch work. No multiplayer connection or score is fabricated.
- Library, Journey, training and Battles render at desktop, phone and iPad sizes.
  Checked phone layouts have no horizontal overflow. The exported cover’s
  background was restored after visual review; tablet map pagination has space
  below the level panel. No browser errors or warnings were recorded.

The optimized iOS export was also served locally. Its library restored the three
completed positions, the `/world/` route rendered correctly, and its level action
opened `/train/` with the five remaining positions. The final local preview is
http://127.0.0.1:3015/ while the local server is running.

Screenshots of the actual app are saved in the task’s
`outputs/figma-integration-20261121/` directory. These are separate from the Figma
prototype screenshots.

## Remaining release gates

The work is not a signed iOS binary, a TestFlight device test, an App Store
submission, or a production deployment. Native WebView and physical-device
verification are still required before release. Authentication, cross-device
transport, hosted extraction and multiplayer require their actual services and
account configuration. The interface accurately remains local-first with an
explicit Battles preview.

# Training workspace increment

The training UI continues to use the existing chess engine, verification, grading,
spaced repetition and `useApp()` interfaces. No persistence or recommendation
implementation is introduced by this increment.

## Implemented

- Library and chapter context, training-mode navigation, real session progress and
  existing auto-advance/timer preferences.
- A board-first responsive workspace with a calculation notebook: preparation,
  candidates, variations, evaluation, committed move and continuation on the board.
- Keyboard move entry in ordinary and focus training. Input uses chess.js legality;
  Runner remains responsible for checking the answer and recording the attempt.
- Refined feedback, source attribution, reflection controls and session results.
- Session results receive the actual attempts created by Runner in this session.
  They do not infer session membership from timestamps or count cloud activity.
- A changed mode, collection, chapter, exercise or map level remounts the session UI,
  fixing the previously retained queue when navigating between map levels. The app
  provider and saved progress remain mounted.
- Global training shortcuts respect text entry, modifier keys and native activation
  of links/buttons. Candidate notes do not intentionally submit an answer.

## Boundaries for Claude

`Runner` still calls `addAttempt` and `amendAttempt` with the existing `Attempt`.
Its new `onRecorded(attempt)` callback supplies an ephemeral presentation summary;
it is not a persistence callback or confirmation that cloud sync has succeeded.

`CalculationNotebook` receives the existing `DeepRecord` and UI callbacks. It owns
no localStorage, recommendation decisions, solution grading or server calls.

The UI needs an acknowledged save/sync status from the eventual provider before
it can truthfully display “Saved” or “Synced.” Current result copy says “Recorded
in your session.” Training preferences still use the existing `cst.auto` and
`cst.timer` keys pending Claude's preferences adapter.

## Observed integration issue — not modified on Claude's branch

In the local `claude/core-platform` work inspected on November 20, the new
`LocalProgressStore.save` merges attempts instead of replacing them, and a separate
`reset()` clears them. `useApp().resetProgress` in `src/lib/store.tsx` still calls
`save(emptyProgress())`. Before integration, it must use the explicit reset path
and test reset followed by reload, stale tabs and cloud reconciliation. Otherwise
old attempts can return after reloading.

Claude's work was uncommitted at inspection. Database, sync and recommendation
files exist, but this is not evidence of completed services or passing integration
tests. Combine the tested branches in a dedicated integration branch.

## Verification and remaining checks

The automated suite includes keyboard-input legality, castling, underpromotion,
wrong-side moves and pinned pieces, alongside the existing 34 domain tests.

Before merging, use local browser control to verify desktop, phone and iPad flows:

1. Library → chapter → training; switch modes and map levels.
2. Solve using the board and typed moves, including promotion.
3. Calculate with the board locked; enter notes, submit a move and finish the line.
4. Use hints, reveal a solution, tag a reflection and continue.
5. Finish a session; compare its counts with the actual recorded attempts.
6. Reload to verify existing local progress; test keyboard focus and zoom.

Browser checks and real-device iOS checks are separate release gates. An iOS
static export does not constitute a signed build or a TestFlight test.

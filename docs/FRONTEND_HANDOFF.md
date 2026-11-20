# Chess Quest frontend branch

Baseline: `818103d24640d7a594056466e586747bcd2f1897` (`v1.0-build1`).
Frontend: `codex/visual-redesign`. Backend counterpart: `claude/core-platform`.
The older local engine fix remains separate; this branch does not edit the learning domain.

## Current audit

- Next.js 16.4.6 / React 19.3, Capacitor iOS, Chessground, chess.js, Stockfish.
- Live production was inspected: first visit showed an empty World screen; built-in samples required a separate import action before appearing in Library.
- Baseline: 34 existing chess/domain tests pass.
- `AppProvider` exposes a typed local library and progress interface. Library uses IndexedDB; attempts and profile use localStorage. No authenticated account, cloud sync, or match service is present.
- The coach is rule-based. The partner URL shares a position and notes; it is not multiplayer.
- Source content validation, user-reviewed exercise protection, and original sample provenance already exist and must remain intact.

## Owned presentation slices

A. Shared dark navy / warm ivory / muted gold tokens, readable typography, mobile navigation, focus/reduced-motion support.
B. Library-first entry, original starter collection available immediately, private imports preserved, search/filter, chapters, genuine progress, direct training/map entry.
C. Sage/ivory board, restrained brass frame, accessible feedback announcements, reduced-motion board animation, and existing calculation/next-exercise controls preserved.
D. Original illustrated academy landscape beneath existing domain-derived paths and level states. Maps stay optional. Keyboard-operable nodes.
E. Book Battles at `/battles`: collection, lobby, match and results previews; Book Rush/Calculation Duel selection, paused clocks/unset scores, private collections solo-only, and real solo-practice entry. See `BATTLE_UI_HANDOFF.md` for the proposed service interface.

## Interfaces needed from Claude

Retain the current `useApp()` contract during parallel development. Avoid simultaneous edits to presentation files.

- Session: authenticated user ID, display name, avatar URL, loading/error state, sign-in/out actions. No tokens or database credentials in presentation.
- Library: account-scoped `LibraryBook[]`; stable book/exercise/chapter IDs, provenance/license/access rights, verified counts, private upload metadata. Preserve IDs from existing imports.
- Attempts: idempotent append using a stable attempt UUID; exercise ID, timestamps, mode, result, recorded variations, hints, timing, diagnostics. Existing attempts must migrate without duplication.
- Progress: account-scoped snapshot or selectors compatible with `computeStats`/`buildCampaign`; distinguish completed from mastered. Report actual sync status (`local`, `syncing`, `synced`, `error`) and retry actions.
- Migration: preview existing local data, explicit account association, transaction/retry-safe import and backup; never clear local data until durable verification. Account switching must not expose another user's private books.
- Recommendations: ranked exercise/book references with evidence and confidence; distinguish measured results from inferred explanations.
- Future matches: match identity, participants, shared authorized exercise-set version, server start/deadline and server score events, lifecycle and reconnect state. UI must never be the score/time authority.

No competing auth/database implementation is included here. Do not change current privacy declarations until the integrated app actually adds collection and the policy is updated.

## Integration and release gates

1. Review each branch independently, then merge into a dedicated integration branch.
2. Test existing local data, migration retries, account isolation and offline transitions.
3. Test catalog → chapter → board → saved attempt → map, including phone and iPad layouts.
4. Test genuine PvP before claiming any battle feature is functional.
5. Use a Vercel preview before production. No production deployment during parallel work.
6. A changed native release needs a new signed build and screenshots before App Store submission. The existing uploaded build 1 does not contain this redesign.

## Validation for this increment

- Existing regression suite: 34/34 tests pass (chess legality, solutions, import merging, progress, campaigns, original samples).
- Production web build and TypeScript: pass.
- New library, cover, icon, shell, campaign/map components and entry routes: ESLint passes.
- Whitespace validation: passes.
- Desktop/phone/iPad visual and interactive checks remain required: browser control became unavailable before the redesigned app could be inspected. Do not treat code checks as visual approval.
- Local iOS export was attempted but stopped during its initial file move while disk space was critically low. Source API route is restored/present. No new signed IPA or device test is claimed.
- The library, board and map work is a draft vertical slice. Complete the browser checks before merging. Book Battles UI is the next separate milestone.

The academy landscape in `public/art/academy-valley.png` is original AI-generated artwork created for this redesign. It contains no book text or publisher artwork. Interactive nodes and progress are drawn from the actual campaign data.

## Follow-up: Book Battles and iOS export

- Added the Book Battles presentation increment; no live PvP or competing backend is implemented.
- A fresh checkout outside the stalled Documents folder resolved the local export stall. `npm run build:ios` now passes, including TypeScript, static export and Capacitor asset sync. This is not a signed native build or a device test.
- Fixed the existing broad CSS loader rule so CSS Modules retain their class exports. The first export exposed missing class names; the corrected export has scoped classes and no stylesheet warnings.
- Added `npm run check:ui-export` to check rendered module classes, emitted CSS, map artwork and the synchronized Capacitor page.
- All 34 existing domain tests still pass. The new Battles components and entry points pass targeted ESLint.
- Visual and interactive verification is tracked separately from these build checks.

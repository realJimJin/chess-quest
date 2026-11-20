# Core and redesign integration — November 20, 2026

Branch: `codex/integration-core-redesign`. Do not merge to `main` or release.

## Sources and ownership

- Shared baseline: `818103d24640d7a594056466e586747bcd2f1897`.
- Redesign: `204d98d667852d1aacc12021562acf5e4f8b191d`.
- Claude's local `claude/core-platform` was still uncommitted. Eighteen changed
  source files were copied into an isolated checkout, verified by SHA-256 and
  committed as `fec08f1`. Ignored files, credentials, private books and the old
  private repository history were not copied.
- Original Claude checkout and both source branches are unchanged. Integration
  fixes are confined to this branch. No migration was run against a hosted DB.

## What is connected

The Training page calls Claude's pure recommender with the actual profile,
trainable exercises, recorded attempts and review schedule. Its sessions open the
exact recommended exercise IDs in order. Unknown/unverified IDs are dropped;
malformed or expired requests never expand into the entire library. The original
starter collection remains available without an upload and is stored only after
an explicit training action.

The existing provider now applies edits to the merge store's latest revision,
uses its explicit reset, refreshes on storage/applied-progress events, and retains
failed writes in a session-local queue with an explicit retry. This is local
persistence integration, not a completed cloud-sync transport.

## Issues found and resolved

- Reset previously saved an empty array into a merge store, leaving old attempts.
  The provider now invokes reset and stale saves respect the persisted reset time.
- Reflection edits made from an old in-memory revision could be discarded after
  the first amendment. Intentional edits now start from the latest stored record.
- Save failures previously had no useful recovery. Pending edits remain visible
  in the session and can be retried without duplicating attempts; the UI warns
  against leaving/reloading until they are saved.
- The recommender omitted why new material was excluded after earlier blocks
  exhausted the daily exercise cap. The explanation is now present.
- Three recommender expectations contradicted the implemented rules: the online
  midpoint of [6, 7, 8] is 7; 15 minutes fits one default 8-minute calculation;
  the next uncleared boss level uses deep-time estimates. Tests were corrected
  with additional checks for the longer drill and ordinary flow cases.
- Ingestion job/event rows could reference another owner's parent UUID despite
  their own user_id policy. Migration 0004 enforces owner-plus-ID foreign keys;
  regression tests reject cross-owner links while permitting the owner's links.

## Validation

| Check | Result | Scope |
| --- | --- | --- |
| Claude snapshot before fixes | 72 passed, 5 failed | Failures investigated, not hidden |
| Core after fixes, before combining | 77 passed | Independent core validation |
| Combined JavaScript suite | 106 passed | Chess, recommendations, merge storage, database policies, UI integration |
| React/DOM integration | 12 passed, included above | Library import, typed solve, calculation, hints, reflections, reset/remount and reset failure, applied/storage events, failed-save retry, recommended session and changed map level |
| Extraction and independent audit | 15 passed, 1 skipped | Synthetic pipeline, Stockfish, original-sample audit, invalid solutions and report redaction |
| TypeScript | Passed | Combined source and tests |
| Targeted ESLint / whitespace | Passed | Changed integration code |
| iOS static export / Capacitor sync | Passed | All 15 pages; no signed native build |
| Export checks | Passed | Training, recommendations and Battles CSS, artwork, matching native web assets |

DOM tests use the real provider, IndexedDB interface (in-memory IndexedDB), local
storage, recommender, trainer and chess grading. They stub routing and Chessground
rendering. They do not verify layout, pointer geometry, animation, WebView behavior
or the Stockfish browser worker. Database policy tests use an embedded PostgreSQL
engine and two test users, not signed-in production accounts.

The extraction skip requires a separate private `CS2_PREVIEW_PDF`; the synthetic
PDF and original puzzle tests pass. No private source document was published.

## Release gates still open

- Local desktop/phone/iPad visual and interaction checks. Local browser controls
  are unavailable in this chat; external browser testing was declined by the user.
- Auth0 sign-in, real account migration and cross-device/offline reconciliation.
  Claude's snapshot contains dependencies, schema and merge foundations, but no
  completed authentication routes or sync transport. No account feature is enabled.
- Hosted extraction worker, upload service and actual multiplayer services.
  Schema comments describe intended workers/services that are not present yet.
  Book Battles remains an explicit design preview.
- Hosted database configuration and restricted application role validation before
  any API uses the schema. The local policy tests do not establish production setup.
- Real-device iOS/TestFlight validation and, before any release, updated native
  build, screenshots and privacy details reflecting what actually ships.

No production deployment, App Store submission, or merge to main is authorized
by this integration increment. The next review should start with local visual
checks and the missing backend services, preserving these tested interfaces.

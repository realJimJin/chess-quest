# Sync safety fixes

The November 22 fixes address account changes uploading another account's local work, reset attempts reappearing after sync, and failed local profile writes overwriting newer cloud data.

## Account ownership

The existing browser progress/profile store stays bound to the first account it syncs. The binding is saved before the first request, even if that request fails. Signing into a different account pauses sync and shows a recovery message; it neither clears the local work nor transfers it. Signing back into the original account resumes sync. Corrupt or unreadable ownership metadata stops sync instead of being treated as an unowned store.

This is a single-account-per-browser safeguard, not separate local stores for multiple accounts. Local content remains accessible on that browser, including while signed out. Use a separate browser profile for another account. First-sign-in import of existing local attempts/profile is unchanged; an explicit migration preview and account-scoped local library remain separate work.

All browser sync requests carry `x-chess-quest-account`, containing the user ID returned by `/api/me`. The server checks it against the authenticated account before reading or changing sync data. This prevents an older tab from silently syncing to an account signed into in another tab. Missing cookie-request bindings return HTTP 428 with a reload message; mismatches return HTTP 409 `account-changed`. Only genuine profile-version conflicts are eligible for merge retries. Bearer callers can omit the header; if supplied, it must match.

Client and server changes must ship together. Existing open tabs running the older client are deliberately stopped until reloaded.

## Reset and storage behavior

`cst.progress.reset` is now a permanent, monotonic local barrier. Acknowledging a reset no longer removes it. Resets received from other devices are saved before applying attempts or advancing the cursor. Older responses cannot lower a newer local reset. Acknowledged barriers are not repeatedly pushed when the server already has them.

The sync storage adapter reports read/write failures and malformed stored state. Applying a downloaded profile must succeed before its version advances or any profile upload is attempted. If the write fails, the newer cloud profile remains intact and Sync now can retry after storage is available. Repeated profile conflicts also report an error instead of a successful sync.

The ordinary profile editor's existing local-save behavior is unchanged; these fixes cover sync persistence and acknowledgement. Opening practice, imported books, and PGN repertoires retain their existing local stores. Cloud sync remains disabled in the static iOS app.

## Validation

- Full Vitest suite: 191 tests passed across 15 files, including real HTTP handlers backed by an isolated PGlite database.
- Regression coverage includes progress/profile account changes, failed initial binding, stale cookie requests and resets, corrupt storage, local/remote reset barriers, resets during an upload, failed local profile application and recovery, and repeated profile conflicts.
- TypeScript and ESLint for all changed code passed.
- Web production build passed (22 generated pages/routes, including sync API handlers).
- iOS static export, Capacitor asset sync, and `check:ui-export` passed (17 generated pages, opening navigation and matching bundled assets verified).

Live Auth0 sign-in, a hosted database, and multi-device production sync have not been exercised. This is a feature-branch fix; no merge to main or production release is part of this change.

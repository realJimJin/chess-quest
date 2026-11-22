# Book Battles presentation and backend boundary

`/battles` is an explicit design preview, not multiplayer. The library links to it as a secondary experience; the library remains the home page. All four screens retain the preview notice. No rooms, invitations, ratings, timers, scores or attempts are created. The only persistence action is an explicit **solo practice** button using the existing `useApp().importBook` and `/train` flow.

## Implemented screens

- Collection: Book Rush / Calculation Duel selection, original starter collection, actual chapter selection and verified exercise counts. Private collection titles stay local and are marked solo-only.
- Lobby: sapphire/crimson player shields, opponent placeholder, selected collection/format, paused clock, disabled invitations and navigation to the match preview.
- Match: existing Board in read-only mode with an authored verified position; paused timer and unset scores; calculation scratch notes are ephemeral and unsubmitted. Solo practice opens the existing training mode with the selected exercise.
- Results: empty comparison table, explicit statement that no match was played, and entry to solo study. No fabricated wins, accuracy, rankings or history.
- Endgame Arena and Book Marathon are named as future formats, without working controls.

## Proposed presentation input (for agreement, not a new backend)

Claude should expose a typed adapter that supplies these fields, using the learning domain's existing IDs:

```ts
type BattleFormat = "book-rush" | "calculation-duel";
type BattlePhase = "lobby" | "ready" | "active" | "completed" | "cancelled";
interface BattleView {
  id: string;
  revision: number;
  phase: BattlePhase;
  format: BattleFormat;
  exerciseSet: { id: string; version: string; bookId: string; chapterId: string; count: number };
  players: { userId: string; displayName: string; avatarUrl: string | null; ready: boolean }[];
  serverNow: number;
  startsAt: number | null;
  deadlineAt: number | null;
  myPosition: { exerciseId: string; fen: string; sideToMove: "white" | "black" } | null;
  scores: { userId: string; completed: number; accuracy: number | null; elapsedMs: number }[] | null;
  connection: "connected" | "reconnecting" | "offline";
}
```

The adapter also needs explicit loading/error/unauthenticated/unavailable states and typed commands for create/join/leave/ready/submit/reconnect. Submissions require idempotency keys; accepted results, deadlines and scoring must be server-authoritative. Handle cancellation, forfeits and stale revisions explicitly.

## Service requirements before enabling live battles

1. Authenticate each player and check access to the *same authorized set version* for every player. A local book title or shared URL is not proof of rights. Never send private uploaded text/positions to opponents without verified access.
2. Serve the allowed position, not answer trees or opponents' drafts, during an active match. Release results/solutions only when the match rules permit it.
3. Persist match lifecycle, idempotent submissions, fair score rules and authoritative start/deadline timestamps. Define the accuracy-first score policy before showing numeric scores.
4. Reconnect without duplicate attempts or clock resets; distinguish an expired match from a disconnected client.
5. Specify how rated, unranked, abandoned and practice attempts affect learning progress. Do not count preview interactions as learning attempts.
6. Test real matches and account isolation before removing the preview label. Update privacy disclosures when cloud identity/match data actually ships.

Presentation owners: `src/components/battles/*`, `src/app/battles/page.tsx`, library entry and shared visual tokens. Claude owns the service, authentication, authorization, storage, score rules and learning-domain integration.

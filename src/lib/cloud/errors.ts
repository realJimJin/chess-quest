export class SyncProblem extends Error {}

export class SyncAccountError extends SyncProblem {
  constructor() {
    super("Sync paused: this browser's saved progress belongs to another account. Sign back into that account to sync. Your saved work has not been moved or deleted.");
  }
}

export class SyncStorageError extends SyncProblem {
  constructor() {
    super("Sync paused because this browser could not read or save its data. Check browser storage, then try Sync now.");
  }
}
export const SYNC_ACCOUNT_HEADER = "x-chess-quest-account";

import { PROGRESS_KEY, RESET_KEY, readProgress, rebuildSrs, writeProgress } from "../progress";
import { readStoredProfile, writeStoredProfile } from "../profile";
import { notifyCloudApplied } from "./events";
import { SyncStorageError } from "./errors";
import type { Api, Io, SyncState } from "./engine";

export const SYNC_STATE_KEY = "cst.sync.v1";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const counter = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function stored<T>(work: () => T): T {
  try { return work(); } catch { throw new SyncStorageError(); }
}

/** Storage errors must stop sync before a cursor advances or stale data is pushed. */
export function browserSyncIo(api: Api): Io {
  return {
    api,
    state: () => stored(() => {
      const raw = localStorage.getItem(SYNC_STATE_KEY);
      if (raw === null) return null;
      const s: unknown = JSON.parse(raw);
      if (!object(s) || typeof s.userId !== "string" || !s.userId || !counter(s.cursor) ||
        !counter(s.profileVersion) || !object(s.synced) || !Object.values(s.synced).every(v => typeof v === "string") ||
        !(s.profileBase === null || object(s.profileBase))) throw new Error("Invalid sync state");
      return s as unknown as SyncState;
    }),
    setState: s => stored(() => localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(s))),
    attempts: () => stored(() => readProgress(PROGRESS_KEY, true).attempts),
    setAttempts: attempts => stored(() => {
      writeProgress({ version: 1, attempts, srs: rebuildSrs(attempts) });
      notifyCloudApplied("progress");
    }),
    resetAt: () => stored(() => {
      const at = Number(localStorage.getItem(RESET_KEY) ?? 0);
      if (!counter(at)) throw new Error("Invalid reset barrier");
      return at;
    }),
    applyReset: at => stored(() => {
      const current = Number(localStorage.getItem(RESET_KEY) ?? 0);
      if (!counter(current) || !counter(at)) throw new Error("Invalid reset barrier");
      if (at > current) {
        localStorage.setItem(RESET_KEY, String(at));
        notifyCloudApplied("progress");
      }
    }),
    profile: () => stored(readStoredProfile),
    setProfile: data => stored(() => { writeStoredProfile(data); notifyCloudApplied("profile"); }),
  };
}

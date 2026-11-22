"use client";
// Browser side of sync: talks to /api, reads and writes this device's storage,
// and decides when to run. Does nothing unless the server has accounts set up
// and the user is signed in.
import { useSyncExternalStore } from "react";
import { IS_IOS } from "../target";
import { onLocalWrite } from "./events";
import { syncProfile, syncProgress } from "./engine";
import { ApiError, apiForAccount, call } from "./api";
import { browserSyncIo } from "./storage";
import { SyncProblem } from "./errors";

export interface Account { id: string; email: string | null; name: string | null; picture: string | null }
export interface SyncStatus { checked: boolean; configured: boolean; user: Account | null; phase: "idle" | "syncing" | "error" | "offline"; lastSyncedAt: number; error: string }

let status: SyncStatus = { checked: false, configured: false, user: null, phase: "idle", lastSyncedAt: 0, error: "" };
const subs = new Set<() => void>();
const set = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; for (const s of [...subs]) s(); };
const SERVER: SyncStatus = status;
export const useSync = (): SyncStatus => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => status, () => SERVER);

let running: Promise<void> | null = null;
let again = false;
/** Run one sync now. Calls made while one is running are folded into a single follow-up. */
export function syncNow(): Promise<void> {
  const user = status.user;
  if (!user) return Promise.resolve();
  if (running) { again = true; return running; }
  const io = browserSyncIo(apiForAccount(user.id));
  set({ phase: "syncing", error: "" });
  running = (async () => {
    try {
      do { again = false; await syncProgress(io, user.id); await syncProfile(io, user.id); } while (again);
      set({ phase: "idle", lastSyncedAt: Date.now() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) set({ user: null, phase: "idle" });
      else if (e instanceof ApiError || e instanceof SyncProblem) set({ phase: "error", error: e.message });
      else set({ phase: "offline", error: "Can't reach the server. Your work is saved on this device and will sync later." });
    } finally { running = null; }
  })();
  return running;
}

let started = false;
/** Find out who is signed in and keep this device in step from then on. Safe to call more than once. */
export function startSync(): void {
  if (started || IS_IOS || typeof window === "undefined") return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => void syncNow(), ms); };
  onLocalWrite((realm) => { if (realm !== "library") soon(1500); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") soon(0); });
  window.addEventListener("online", () => soon(0));
  setInterval(() => { if (document.visibilityState === "visible") void syncNow(); }, 60_000);
  call<{ configured: boolean; user: Account | null }>("/api/me")
    .then((me) => { set({ checked: true, configured: !!me?.configured, user: me?.user ?? null }); void syncNow(); })
    .catch(() => set({ checked: true }));
}

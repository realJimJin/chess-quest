"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { syncNow, useSync } from "@/lib/cloud/client";

const LABEL = { idle: "Synced", syncing: "Syncing…", error: "Sync problem", offline: "Offline" } as const;
const DOT = { idle: "bg-good", syncing: "bg-accent animate-pulse", error: "bg-bad", offline: "bg-mute" } as const;

/** Header corner: a sign-in link, or who is signed in and whether their work has reached the account. */
export function AccountChip() {
  const s = useSync();
  const path = usePathname();
  if (!s.configured) return <span className="local-status">On this device</span>;
  if (!s.user) return <a href={`/auth/login?returnTo=${encodeURIComponent(path)}`} className="btn whitespace-nowrap text-sm" data-testid="sign-in">Sign in</a>;
  return (
    <Link href="/profile" className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm text-mute hover:text-ink" title={s.error || LABEL[s.phase]} data-testid="account">
      <span className={`h-2 w-2 rounded-full ${DOT[s.phase]}`} />
      <span className="hidden max-w-32 truncate sm:inline">{s.user.name || s.user.email || "Account"}</span>
    </Link>
  );
}

/** Profile page card: account, sync state, sign out. */
export function AccountCard() {
  const s = useSync();
  if (!s.configured) return null;
  if (!s.user) return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div><h2 className="font-semibold">Account</h2><p className="mt-1 text-sm text-mute">Sign in to keep your attempts, review queue and profile in step across devices. What is already on this device is added to your account.</p></div>
      <a href="/auth/login?returnTo=%2Fprofile" className="btn">Sign in</a>
    </section>
  );
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-5" data-testid="account-card">
      <div><h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-sm">{s.user.email || s.user.name || "Signed in"}</p>
        <p className={`mt-1 text-xs ${s.phase === "error" ? "text-bad" : "text-mute"}`}>
          {s.phase === "error" || s.phase === "offline" ? s.error : s.phase === "syncing" ? "Syncing…" : s.lastSyncedAt ? `Synced at ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
        </p></div>
      <div className="flex gap-2"><button className="btn" onClick={() => void syncNow()} disabled={s.phase === "syncing"}>Sync now</button><a href="/auth/logout" className="btn btn-ghost">Sign out</a></div>
    </section>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useProfile } from "@/lib/useProfile";
import { computeStats } from "@/lib/progress";
import { isTrainable } from "@/lib/validate";
import { activity, rankFor, totalXp } from "@/lib/game";
import { MILESTONES } from "@/lib/profile";

export default function ProfilePage() {
  const { exercises, progress, resetProgress } = useApp();
  const [profile, setProfile] = useProfile();
  const [now] = useState(() => Date.now());
  const [reached, setReached] = useState<string[]>([]);
  useEffect(() => { try { setReached(JSON.parse(localStorage.getItem("cst.milestones") ?? "[]")); } catch { /* none */ } }, []);
  const toggle = (k: string) => { const n = reached.includes(k) ? reached.filter((x) => x !== k) : [...reached, k]; setReached(n); try { localStorage.setItem("cst.milestones", JSON.stringify(n)); } catch { /* ignore */ } };
  const pool = useMemo(() => exercises.filter(isTrainable), [exercises]);
  const st = computeStats(progress, pool, now);
  const xp = totalXp(progress, new Map(exercises.map((e) => [e.id, e])));
  const rank = rankFor(xp);
  const act = activity(progress.attempts, now);
  const max = Math.max(1, ...act.map((a) => a.count));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Profile</h1><p className="text-sm text-mute">Stored in this browser. The same record becomes your account later.</p></div>
        <input className="field w-56" placeholder="Your name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
      </div>
      <section className="grid gap-3 md:grid-cols-4">
        <div className="card p-4 md:col-span-2"><div className="label">Rank {rank.level} · {xp} XP</div><div className="mt-1 text-2xl font-semibold">{rank.title}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-accent" style={{ width: `${(rank.into / rank.span) * 100}%` }} /></div>
          <p className="mt-2 text-xs text-mute">XP comes from solving, from time spent in Deep Calculation and from written analysis. Speed earns nothing extra; re-solving old exercises earns little.</p></div>
        <div className="card p-4"><div className="label">Solved</div><div className="mt-1 text-2xl font-semibold tabular-nums">{st.solved}<span className="text-base text-mute">/{pool.length}</span></div><div className="text-xs text-mute">first-try {st.firstTryAccuracy === null ? "—" : `${Math.round(st.firstTryAccuracy * 100)}%`}</div></div>
        <div className="card p-4"><div className="label">Streak</div><div className="mt-1 text-2xl font-semibold tabular-nums">{st.streak}</div><div className="text-xs text-mute">{Math.round(st.totalTimeMs / 60000)} min calculating in total</div></div>
      </section>
      <section className="card p-5">
        <div className="label">Activity · last 12 weeks</div>
        <div className="mt-3 grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: "minmax(0,1fr)" }} data-testid="activity">
          {act.map((a) => <div key={a.day} title={`${new Date(a.day).toLocaleDateString()}: ${a.count}`} className="aspect-square rounded-[3px]" style={{ background: a.count ? `rgba(94,234,212,${0.25 + 0.75 * (a.count / max)})` : "#1a1e25" }} />)}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5"><h2 className="font-semibold">Ratings</h2>
          <div className="mt-3 flex flex-col gap-2">{profile.ratings.map((r, i) => (
            <label key={r.label} className="flex items-center justify-between gap-3 text-sm"><span className="text-mute">{r.label}</span>
              <input className="field w-28 text-right tabular-nums" value={r.value} onChange={(e) => setProfile({ ...profile, ratings: profile.ratings.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} /></label>))}</div>
          <h2 className="mt-5 font-semibold">Repertoire</h2>
          <ul className="mt-2 text-sm">{profile.repertoire.map((r) => <li key={r.side} className="flex justify-between border-b border-line py-1.5 last:border-0"><span className="text-mute">{r.side}</span><span>{r.opening}</span></li>)}</ul>
        </div>
        <div className="card p-5"><h2 className="font-semibold">Milestones</h2>
          <p className="mt-1 text-xs text-mute">Tick these yourself once your federation rating says so. The app does not award ratings or titles.</p>
          <ul className="mt-3 flex flex-col gap-2">{MILESTONES.map((m) => (
            <li key={m.key}><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={reached.includes(m.key)} onChange={() => toggle(m.key)} />
              <span className={reached.includes(m.key) ? "text-good" : ""}>{m.label}</span></label></li>))}</ul>
          <h2 className="mt-5 font-semibold">Training allocation</h2>
          <p className="mt-1 text-xs text-mute">Starting weights you chose, not measured weaknesses. They shape the Train plan.</p>
          <div className="mt-3 flex flex-col gap-2">{profile.allocation.map((a, i) => (
            <label key={a.key} className="flex items-center gap-3 text-sm"><span className="flex-1 text-mute">{a.label}</span>
              <input type="range" min={0} max={60} step={5} value={a.weight} onChange={(e) => setProfile({ ...profile, allocation: profile.allocation.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} />
              <span className="w-9 text-right tabular-nums">{a.weight}%</span></label>))}</div>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm"><span className="text-mute">Daily goal (exercises)</span>
            <input className="field w-20 text-right" type="number" min={1} max={100} value={profile.dailyGoal} onChange={(e) => setProfile({ ...profile, dailyGoal: Math.max(1, Number(e.target.value) || 1) })} /></label>
        </div>
      </section>
      <div className="flex flex-wrap gap-2"><Link className="btn" href="/partner">Partner session</Link><Link className="btn" href="/import">Import and review</Link>
        <button className="btn btn-ghost text-xs" onClick={() => window.confirm("Erase all recorded attempts and the review queue on this device?") && resetProgress()}>Reset progress on this device</button></div>
    </div>
  );
}

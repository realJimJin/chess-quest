"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useProfile } from "@/lib/useProfile";
import { computeStats } from "@/lib/progress";
import { isTrainable } from "@/lib/validate";
import { buildCampaign } from "@/lib/game";
import { todaysPlan } from "@/lib/coach";

export default function Today() {
  const { exercises, progress, library } = useApp();
  const [profile] = useProfile();
  const [now] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(90);
  const pool = useMemo(() => exercises.filter(isTrainable), [exercises]);
  const st = useMemo(() => computeStats(progress, pool, now), [progress, pool, now]);
  const bookId = Object.values(library).find((b) => b.exercises.some(isTrainable))?.book.id;
  const camp = useMemo(() => (bookId ? buildCampaign(bookId, exercises, st.doneIds, profile.freeRoam) : null), [bookId, exercises, st.doneIds, profile.freeRoam]);
  const plan = todaysPlan(profile, st, camp, exercises, minutes);
  const pct = Math.min(100, Math.round((st.today / profile.dailyGoal) * 100));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-mute">Built from your training allocation and what is actually in your library.</p></div>
        <label className="flex items-center gap-2 text-xs text-mute">Session length
          <select className="field w-auto py-1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
      </div>
      <div className="card p-4">
        <div className="flex items-baseline justify-between"><span className="label">Daily goal</span><span className="text-sm tabular-nums">{st.today}/{profile.dailyGoal} exercises</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 text-xs text-mute">{st.streak ? `${st.streak}-day streak.` : "No streak running."} A rest day does not reset your rank or your map; the streak simply starts again when you do.</p>
      </div>
      <ol className="flex flex-col gap-3" data-testid="plan">
        {plan.map((p, i) => (
          <li key={i} className={`card flex items-center gap-4 p-4 ${p.available ? "" : "opacity-70"}`}>
            <div className="w-14 shrink-0 text-center"><div className="text-xl font-semibold tabular-nums">{p.minutes}</div><div className="text-[10px] uppercase tracking-wide text-mute">min</div></div>
            <div className="min-w-0 flex-1"><div className="font-medium">{p.title}</div><div className="text-sm text-mute">{p.detail}</div></div>
            {p.href && p.cta ? <Link href={p.href} className={`btn ${i === 0 ? "btn-primary" : ""} shrink-0`}>{p.cta}</Link> : <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-mute">{p.available ? "" : "gap"}</span>}
          </li>))}
      </ol>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="btn" href="/train?mode=flow">Free Puzzle Flow</Link><Link className="btn" href="/train?mode=deep&min=8">Deep Calculation, hardest stages</Link>
        <Link className="btn" href="/train?mode=focus">Focus</Link><Link className="btn" href="/partner">Study with a partner</Link>
      </div>
    </div>
  );
}

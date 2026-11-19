"use client";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { CATEGORIES, computeStats } from "@/lib/progress";
import { CATEGORY_INFO, recommendations } from "@/lib/diagnostics";
import { isTrainable } from "@/lib/validate";
import { bookTitle } from "@/lib/books";
import { SHELF } from "@/lib/profile";

const hrs = (ms: number) => (ms >= 3600000 ? `${(ms / 3600000).toFixed(1)} h` : `${Math.round(ms / 60000)} min`);

export default function CoachPage() {
  const { exercises, progress } = useApp();
  const [now] = useState(() => Date.now());
  const pool = exercises.filter(isTrainable);
  const st = computeStats(progress, pool, now);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const maxCat = Math.max(1, ...CATEGORIES.map((c) => st.categories[c].evidence + st.categories[c].self + st.categories[c].weak));
  const recs = recommendations(st.categories, { firstTryAccuracy: st.firstTryAccuracy, attempted: st.attempted, deepShare: st.totalTimeMs ? st.deepTimeMs / st.totalTimeMs : 0, unexplained: st.unexplainedFailures });
  const tiles: [string, string][] = [
    ["Solved", `${st.solved}`], ["Not yet solved", `${st.failedIds.length}`],
    ["First-try accuracy", st.firstTryAccuracy === null ? "—" : `${Math.round(st.firstTryAccuracy * 100)}%`],
    ["Attempts / exercise", st.attempted ? st.avgAttempts.toFixed(2) : "—"],
    ["Time calculating", hrs(st.totalTimeMs)], ["of it in Deep mode", hrs(st.deepTimeMs)],
    ["Daily streak", `${st.streak}`], ["Review queue", `${st.due}`],
  ];
  return (
    <div className="flex flex-col gap-8">
      <div><h1 className="text-2xl font-semibold tracking-tight">AI Coach</h1>
        <p className="mt-1 max-w-3xl text-sm text-mute">Today this coach is rule-based: it reads your recorded lines, clock and tags and ranks what they show. It separates what was observed from what is only inferred, and it does not use a language model yet.</p></div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([l, v]) => <div key={l} className="card p-4"><div className="label">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div></div>)}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">Road to National Master — what to work on</h2>
          <p className="mt-1 text-xs text-mute">Built only from misses you documented (written lines, timing, your own tags). It ranks your recorded error types; it is not a rating prediction.</p>
          {recs.length === 0 ? <p className="mt-4 text-sm text-mute">Not enough recorded misses yet. Solve in Deep Calculation and tag your mistakes — priorities appear here.</p> : (
            <ol className="mt-4 flex flex-col gap-3">{recs.map((r, i) => (
              <li key={r.title} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-[#062a26]">{i + 1}</span>
                <div><div className="text-sm font-medium">{r.title}</div><div className="text-sm text-mute">{r.detail}</div></div></li>))}</ol>)}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Mistake types</h2>
          <p className="mt-1 text-xs text-mute">Solid = shown by your written lines or clock · light = your own tags · faint = weak signal.</p>
          <div className="mt-4 flex flex-col gap-3">
            {CATEGORIES.map((c) => { const v = st.categories[c]; return (
              <div key={c}><div className="flex justify-between text-sm"><span>{CATEGORY_INFO[c].label}</span><span className="tabular-nums text-mute">{v.evidence + v.self + v.weak}</span></div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-panel2">
                  <div className="bg-accent" style={{ width: `${(v.evidence / maxCat) * 100}%` }} /><div className="bg-accent/50" style={{ width: `${(v.self / maxCat) * 100}%` }} /><div className="bg-accent/20" style={{ width: `${(v.weak / maxCat) * 100}%` }} />
                </div></div>); })}
          </div>
          {st.unexplainedFailures > 0 && <p className="mt-4 text-xs text-mute">{st.unexplainedFailures} miss{st.unexplainedFailures === 1 ? "" : "es"} with no recorded cause are not counted above.</p>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">Chapter completion</h2>
          {st.chapters.length === 0 ? <p className="mt-3 text-sm text-mute">No exercises imported.</p> : (
            <div className="mt-4 flex flex-col gap-3">{st.chapters.map((c) => (
              <div key={c.bookId + c.chapterId}><div className="flex justify-between text-sm"><span>{bookTitle(c.bookId)} · {c.title}</span><span className="tabular-nums text-mute">{c.solved}/{c.total}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-good" style={{ width: `${(c.solved / c.total) * 100}%` }} /></div></div>))}</div>)}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Most frequently missed</h2>
          {st.mostMissed.length === 0 ? <p className="mt-3 text-sm text-mute">No misses recorded.</p> : (
            <ul className="mt-3 divide-y divide-line">{st.mostMissed.map((m) => { const e = byId.get(m.id); return (
              <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                <span>{e ? `${bookTitle(e.bookId)} № ${e.number}` : m.id}<span className="ml-2 text-xs text-mute">{e?.chapter.title}</span></span>
                <span className="flex items-center gap-3"><span className="tabular-nums text-bad">{m.misses}× missed</span><span className="tabular-nums text-mute">{m.attempts} tries</span>
                  {e && <Link className="chip" href={`/train?mode=flow&id=${encodeURIComponent(m.id)}`}>Retry</Link>}</span></li>); })}</ul>)}
        </div>
      </section>
      {SHELF.length > 0 && <section className="card p-5">
        <h2 className="font-semibold">Curriculum coverage</h2>
        <p className="mt-1 text-xs text-mute">What your library can and cannot train right now.</p>
        <ul className="mt-3 divide-y divide-line text-sm">{SHELF.map((b) => { const n = exercises.filter((e) => e.bookId === b.id && isTrainable(e)).length; return (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2"><span>{b.title} <span className="ml-2 text-xs text-mute">{b.lesson}</span></span>
            <span className={`text-xs ${n ? "text-good" : "text-mute"}`}>{n ? `${n} exercises ready` : "not imported — gap"}</span></li>); })}</ul>
      </section>}

    </div>
  );
}

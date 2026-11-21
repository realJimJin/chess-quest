"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { useProfile } from "@/lib/useProfile";
import { computeStats } from "@/lib/progress";
import { isTrainable } from "@/lib/validate";
import { buildCampaign, rankFor, totalXp, PASS_RATIO, type Level } from "@/lib/game";
import { MILESTONES } from "@/lib/profile";
import WorldMap from "@/components/WorldMap";
import { SAMPLE_PACK } from "@/lib/samples";
import { IS_IOS } from "@/lib/target";

export default function World() {
  const { ready, library, exercises, progress, importBook } = useApp();
  const query = useSearchParams();
  const [profile, setProfile] = useProfile();
  const [now] = useState(() => Date.now());
  const [picked, setPicked] = useState<string | null>(null);
  const currentRef = useRef<SVGGElement>(null);
  const books = Object.values(library).filter((b) => b.exercises.some(isTrainable));
  const [bookId, setBookId] = useState<string | null>(null);
  const requestedBook = query.get("book");
  const active = bookId ?? (books.some(b => b.book.id === requestedBook) ? requestedBook : null) ?? books[0]?.book.id ?? null;
  const pool = useMemo(() => exercises.filter(isTrainable), [exercises]);
  const st = useMemo(() => computeStats(progress, pool, now), [progress, pool, now]);
  const camp = useMemo(() => (active ? buildCampaign(active, exercises, st.doneIds, profile.freeRoam) : null), [active, exercises, st.doneIds, profile.freeRoam]);
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const rank = rankFor(totalXp(progress, byId));
  const sel: Level | null = camp ? camp.levels.find((l) => l.id === picked) ?? camp.current ?? camp.levels[camp.levels.length - 1] ?? null : null;


  if (ready && !camp?.levels.length) {
    return (
      <div className="card mx-auto mt-10 max-w-xl p-8 text-center" data-testid="world-empty">
        <div className="text-5xl">♜</div>
        <h1 className="mt-3 text-xl font-semibold">Your next chapter awaits</h1>
        <p className="mt-2 text-sm text-mute">Explore the original starter collection, or turn your own book’s chapters into a learning journey.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn btn-primary" data-testid="load-samples" onClick={() => importBook(SAMPLE_PACK.book, SAMPLE_PACK.exercises)}>Explore the starter collection</button>
          <Link href="/import" className="btn">Import a book</Link>
        </div>
        <p className="mt-3 text-xs text-mute">The sample pack is eight original puzzles written for this app. They are not from any book.</p>
      </div>);
  }
  if (!camp) return <p className="py-20 text-center text-mute">Loading your world…</p>;

  const selEx = sel ? sel.exerciseIds.length : 0;
  const need = sel ? Math.ceil(selEx * PASS_RATIO) : 0;

  return (
    <div className="journey-layout">
      <div className="journey-landscape">
        <div className="map-frame relative">
          <WorldMap camp={camp} selectedId={sel?.id ?? null} onPick={setPicked} currentRef={currentRef} />
          <div className="map-legend"><span><i />Available</span><span><i />Completed</span><span><i />Locked</span></div>
        </div>
      </div>

      {sel && (
        <div className="journey-mobile-bar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur lg:hidden" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }} data-testid="level-bar">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{sel.boss ? "Boss level" : `Level ${sel.index + 1}`} · № {sel.firstNumber}–{sel.lastNumber}</div>
              <div className="text-xs text-mute">{sel.state === "locked" ? "Locked — clear the level before it" : `${sel.solved}/${selEx} done · clears at ${need}`}</div>
            </div>
            {sel.state !== "locked" && <>
              <Link className="btn" href={`/train?mode=deep&level=${encodeURIComponent(sel.id)}`}>Deep</Link>
              <Link className="btn btn-primary" data-testid="bar-play" href={`/train?mode=flow&level=${encodeURIComponent(sel.id)}`}>Play</Link>
            </>}
          </div>
        </div>)}
      <aside className="journey-rail">
        <div className="journey-heading mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/library" className="eyebrow mb-3">← BACK TO LIBRARY</Link>
            <h1 className="text-2xl font-semibold tracking-tight">{camp.bookId === "samples" ? "The Starter Collection" : library[camp.bookId]?.book.title.split(" — ")[0] ?? "Campaign"}</h1>
            <p className="text-xs text-mute">{camp.regions.length} {camp.regions.length === 1 ? "region" : "regions"} · {camp.levels.length} {camp.levels.length === 1 ? "level" : "levels"} · your learning journey</p>
          </div>
          {books.length > 1 && <select aria-label="Choose a collection for the map" className="field w-auto" value={active ?? ""} onChange={(e) => setBookId(e.target.value)}>{books.map((b) => <option key={b.book.id} value={b.book.id}>{b.book.title}</option>)}</select>}
        </div>

        <div className="card p-4">
          <div className="flex items-baseline justify-between"><span className="label">Rank {rank.level}</span><span className="text-xs text-mute">{rank.into}/{rank.span} XP</span></div>
          <div className="mt-1 text-lg font-semibold">{rank.title}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-accent transition-all" style={{ width: `${(rank.into / rank.span) * 100}%` }} /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div><div className="text-lg font-semibold tabular-nums">{st.streak}</div><div className="text-mute">day streak</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{st.today}/{profile.dailyGoal}</div><div className="text-mute">today</div></div>
            <div><div className="text-lg font-semibold tabular-nums">{st.due}</div><div className="text-mute">reviews due</div></div>
          </div>
        </div>
        {sel && (
          <div className="card p-4" data-testid="level-panel">
            <div className="label">{camp.regions.find((r) => r.chapterId === sel.chapterId)?.title}</div>
            <h2 className="mt-1 text-lg font-semibold">{sel.boss ? "Boss level" : `Level ${sel.index + 1}`} <span className="text-sm font-normal text-mute">· № {sel.firstNumber}–{sel.lastNumber}</span></h2>
            <p className="mt-1 text-sm text-mute">{sel.solved}/{selEx} solved · clears at {need}</p>
            {sel.state === "locked" ? (
              <p className="mt-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-mute">Clear the level before it to open this one, or switch on free roam.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Link className="btn btn-primary" data-testid="level-flow" href={`/train?mode=flow&level=${encodeURIComponent(sel.id)}`}>Puzzle Flow</Link>
                <Link className="btn" href={`/train?mode=deep&level=${encodeURIComponent(sel.id)}`}>Deep Calculation{sel.boss ? " — recommended" : ""}</Link>
                <Link className="btn" href={`/train?mode=focus&level=${encodeURIComponent(sel.id)}`}>Focus</Link>
              </div>)}
            <label className="mt-3 flex items-center gap-2 text-xs text-mute"><input type="checkbox" checked={profile.freeRoam} onChange={(e) => setProfile({ ...profile, freeRoam: e.target.checked })} /> Free roam — open every level</label>
          </div>)}
        {!IS_IOS && <div className="card p-4">
          <div className="label">Road to National Master</div>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">{MILESTONES.map((m) => <li key={m.key} className="flex items-center gap-2 text-mute"><span className="h-1.5 w-1.5 rounded-full bg-warn" />{m.label}</li>)}</ul>
          <p className="mt-2 text-[11px] text-mute">Your own goals. Ratings and titles are earned over the board; tick them off in Profile when you do.</p>
        </div>}
      </aside>
    </div>
  );
}

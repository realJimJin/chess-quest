"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Runner from "@/components/Runner";
import { useApp } from "@/lib/store";
import { isTrainable } from "@/lib/validate";
import { computeStats, dueReviews } from "@/lib/progress";
import { buildCampaign } from "@/lib/game";
import type { Mode } from "@/lib/types";

const MODES: Record<Mode, { title: string; blurb: string }> = {
  flow: { title: "Puzzle Flow", blurb: "One exercise after another, in book order." },
  deep: { title: "Deep Calculation", blurb: "Board locked. Think, write your lines, commit once." },
  review: { title: "Mistake Review", blurb: "Missed exercises, spaced out until they stick." },
  focus: { title: "Focus", blurb: "Just the board." },
};

function Session() {
  const q = useSearchParams();
  const mode = (["flow", "deep", "review", "focus"].includes(q.get("mode") ?? "") ? q.get("mode") : "flow") as Mode;
  const book = q.get("book"), chapter = q.get("chapter"), id = q.get("id"), minDiff = Number(q.get("min") ?? 0), level = q.get("level");
  const { ready, exercises, progress } = useApp();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [sessionStart] = useState(() => Date.now());
  const [auto, setAuto] = useState(true);
  const [timer, setTimer] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    try { setAuto(localStorage.getItem("cst.auto") !== "0"); setTimer(localStorage.getItem("cst.timer") === "1"); } catch { /* defaults */ }
  }, []);
  useEffect(() => { setQueue(null); setIdx(0); setDone(0); }, [mode, book, chapter, id, minDiff]);
  useEffect(() => {
    // the queue is fixed when the session starts so it doesn't reshuffle as you solve
    if (!ready || queue) return;
    const pool = exercises.filter(isTrainable);
    const byId = new Map(pool.map((e) => [e.id, e]));
    let ids: string[];
    if (id) ids = byId.has(id) ? [id] : [];
    else if (level) {
      const solved = computeStats(progress, pool, Date.now()).doneIds;
      const lv = buildCampaign(level.split(":")[0], exercises, solved, true).levels.find((l) => l.id === level);
      const all = lv?.exerciseIds ?? [];
      const fresh = all.filter((x) => !solved.has(x));
      ids = fresh.length ? fresh : all;
    }
    else if (mode === "review") ids = dueReviews(progress, Date.now()).filter((x) => byId.has(x));
    else {
      const solved = computeStats(progress, pool, Date.now()).doneIds;
      const list = pool.filter((e) => (!book || e.bookId === book) && (!chapter || e.chapter.id === chapter) && e.difficulty.value >= minDiff)
        .sort((a, b) => a.bookId.localeCompare(b.bookId) || a.number - b.number);
      const fresh = list.filter((e) => !solved.has(e.id));
      ids = (fresh.length ? fresh : list).map((e) => e.id);
    }
    setQueue(ids);
  }, [ready, queue, exercises, progress, mode, book, chapter, id, minDiff, level]);

  const next = useCallback(() => { setDone((d) => d + 1); setIdx((i) => i + 1); }, []);
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  if (!ready || !queue) return <p className="py-20 text-center text-mute">Loading your library…</p>;
  const ex = queue[idx] ? byId.get(queue[idx]) : undefined;
  const trainable = exercises.filter(isTrainable).length;
  const mapBook = book ?? (level ? level.split(":")[0] : undefined);
  const mapHref = mapBook ? `/world?book=${encodeURIComponent(mapBook)}` : "/world";

  if (!ex) {
    return (
      <div className="card mx-auto mt-10 max-w-lg p-8 text-center" data-testid="session-end">
        {trainable === 0 ? (<>
          <h1 className="text-xl font-semibold">No exercises in your library yet</h1>
          <p className="mt-2 text-sm text-mute">Start with eight original puzzles, or import your own exercise collection.</p>
          <Link href="/" className="btn btn-primary mt-5">Open your library</Link>
        </>) : done > 0 ? (<>
          <h1 className="text-xl font-semibold">Session complete</h1>
          <p className="mt-2 text-sm text-mute">{done} exercise{done === 1 ? "" : "s"} worked through.</p>
          <div className="mt-5 flex justify-center gap-2"><Link href={mapHref} className="btn btn-primary">Back to the map</Link><Link href="/coach" className="btn">AI Coach</Link></div>
        </>) : (<>
          <h1 className="text-xl font-semibold">{mode === "review" ? "Nothing due for review" : "No exercises match"}</h1>
          <p className="mt-2 text-sm text-mute">{mode === "review" ? "Missed exercises come back here on a schedule." : "Try another chapter or difficulty."}</p>
          <Link href={mapHref} className="btn btn-primary mt-5">Back to the map</Link>
        </>)}
      </div>
    );
  }

  const toggle = (key: string, v: boolean, set: (b: boolean) => void) => { set(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* ignore */ } };
  return (
    <div>
      <div className={`training-heading mb-4 flex flex-wrap items-center justify-between gap-2 ${mode === "focus" ? "opacity-60 hover:opacity-100" : ""}`}>
        <div>
          <h1 className="text-base font-semibold">{MODES[mode].title}</h1>
          {mode !== "focus" && <p className="text-xs text-mute">{MODES[mode].blurb}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(Object.keys(MODES) as Mode[]).map((m) => {
            const p = new URLSearchParams(q.toString()); p.set("mode", m); p.delete("id");
            return <Link key={m} href={`/train?${p}`} className="chip" data-on={m === mode}>{MODES[m].title}</Link>;
          })}
          {mode !== "deep" && <button className="chip" data-on={auto} onClick={() => toggle("cst.auto", !auto, setAuto)}>Auto-advance</button>}
          {mode === "focus" && <button className="chip" data-on={timer} onClick={() => toggle("cst.timer", !timer, setTimer)}>Session timer</button>}
          {mode === "focus" && typeof document !== "undefined" && document.fullscreenEnabled && <button className="chip" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => undefined))}>Full screen</button>}
        </div>
      </div>
      <Runner key={`${ex.id}:${idx}`} ex={ex} mode={mode} position={`${idx + 1}/${queue.length}`} onNext={next} autoAdvance={auto} sessionStart={sessionStart} showSessionTimer={mode === "focus" && timer} />
    </div>
  );
}

export default function TrainPage() {
  return <Suspense fallback={<p className="py-20 text-center text-mute">Loading…</p>}><Session /></Suspense>;
}

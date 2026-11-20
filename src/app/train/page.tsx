"use client";
import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Runner from "@/components/Runner";
import SessionSummary from "@/components/training/SessionSummary";
import styles from "@/components/training/training.module.css";
import { requestedExerciseIds } from "@/components/training/plan";
import { useApp } from "@/lib/store";
import { isTrainable } from "@/lib/validate";
import { computeStats, dueReviews } from "@/lib/progress";
import { buildCampaign } from "@/lib/game";
import type { Attempt, Mode } from "@/lib/types";

const MODES: Record<Mode, { title: string; short: string; blurb: string }> = {
  flow: { title: "One position at a time.", short: "Puzzle Flow", blurb: "Find the idea. Play it through. Carry what you learn into the next position." },
  deep: { title: "Make room for a deeper idea.", short: "Calculate", blurb: "Keep the pieces still. Consider your candidates and write the line you believe in." },
  review: { title: "See it with fresh eyes.", short: "Review", blurb: "Return to the positions that deserve another thoughtful look." },
  focus: { title: "Just you and the position.", short: "Focus", blurb: "A little less around you. A little more attention on the board." },
};

function savedPreference(key: string, fallback: boolean) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === "1"; }
  catch { return fallback; }
}

function Session() {
  const q = useSearchParams();
  const mode = (["flow", "deep", "review", "focus"].includes(q.get("mode") ?? "") ? q.get("mode") : "flow") as Mode;
  const book = q.get("book"), chapter = q.get("chapter"), id = q.get("id"), minDiff = Number(q.get("min") ?? 0), level = q.get("level");
  const requested = q.get("ids");
  const { exercises, progress, library } = useApp();
  const [idx, setIdx] = useState(0);
  const [sessionStart] = useState(() => Date.now());
  const [auto, setAuto] = useState(() => savedPreference("cst.auto", true));
  const [timer, setTimer] = useState(() => savedPreference("cst.timer", false));
  const [done, setDone] = useState(0);
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);

  const [queue] = useState(() => {
    // SessionRoute waits for the library. Capture the queue once so solving or
    // background sync cannot reshuffle the session already in progress.
    const pool = exercises.filter(isTrainable);
    const byId = new Map(pool.map((e) => [e.id, e]));
    let ids: string[];
    if (requested !== null) ids = requestedExerciseIds(requested, new Set(byId.keys()));
    else if (id) ids = byId.has(id) ? [id] : [];
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
    return ids;
  });

  const next = useCallback(() => { setDone((d) => d + 1); setIdx((i) => i + 1); }, []);
  const recordInSession = useCallback((attempt: Attempt) => setSessionAttempts(attempts => [...attempts, attempt]), []);
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const ex = queue[idx] ? byId.get(queue[idx]) : undefined;
  const trainable = exercises.filter(isTrainable).length;
  const mapBook = book ?? (level ? level.split(":")[0] : undefined);
  const mapHref = mapBook ? `/world?book=${encodeURIComponent(mapBook)}` : "/world";
  const collection = ex ? library[ex.bookId] : undefined;
  const collectionTitle = ex?.bookId === "samples" ? "The Starter Collection" : collection?.book.title;

  if (!ex) {
    if (done > 0) {
      return <SessionSummary attempts={sessionAttempts} mapHref={mapHref} />;
    }
    return (
      <div className={styles.emptyState} data-testid="session-end">
        {trainable === 0 ? (<>
          <h1 className="text-xl font-semibold">No exercises in your library yet</h1>
          <p className="mt-2 text-sm text-mute">Start with eight original puzzles, or import your own exercise collection.</p>
          <Link href="/" className="btn btn-primary mt-5">Open your library</Link>
        </>) : (<>
          <h1 className="text-xl font-semibold">{mode === "review" ? "Nothing due for review" : "No exercises match"}</h1>
          <p className="mt-2 text-sm text-mute">{mode === "review" ? "Missed exercises come back here on a schedule." : "Try another chapter or difficulty."}</p>
          <Link href="/" className="btn btn-primary mt-5">Back to your library</Link>
        </>)}
      </div>
    );
  }

  const toggle = (key: string, v: boolean, set: (b: boolean) => void) => { set(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* ignore */ } };
  return (
    <div className={styles.workspace}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Library</Link><span aria-hidden="true">/</span>{collectionTitle && <><span>{collectionTitle}</span><span aria-hidden="true">/</span></>}<span>{ex.chapter.title}</span></nav>
      <header className={styles.sessionHeader}>
        <div>
          <span className="eyebrow">{mode === "deep" ? "DEEP CALCULATION" : mode === "review" ? "MISTAKE REVIEW" : mode === "focus" ? "FOCUS" : "PUZZLE FLOW"}</span>
          <h1>{MODES[mode].title}</h1>
          {mode !== "focus" && <p>{MODES[mode].blurb}</p>}
        </div>
        <nav className={styles.modeNav} aria-label="Training mode">
          {(Object.keys(MODES) as Mode[]).map((m) => {
            const p = new URLSearchParams(q.toString()); p.set("mode", m); p.delete("id"); p.delete("ids");
            return <Link key={m} href={`/train?${p}`} aria-current={m === mode ? "page" : undefined}>{MODES[m].short}</Link>;
          })}
        </nav>
      </header>
      <div className={styles.sessionTools}>
        <div className={styles.sessionPosition}><span>Position {idx + 1} of {queue.length}</span><progress value={idx} max={queue.length} aria-label="Exercises worked through" /></div>
        <div className={styles.preferences}>
          {mode !== "deep" && <label><input type="checkbox" checked={auto} onChange={event => toggle("cst.auto", event.target.checked, setAuto)} />Auto-advance</label>}
          {mode === "focus" && <label><input type="checkbox" checked={timer} onChange={event => toggle("cst.timer", event.target.checked, setTimer)} />Session timer</label>}
          {mode === "focus" && typeof document !== "undefined" && document.fullscreenEnabled && <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => undefined))}>Full screen</button>}
        </div>
      </div>
      <Runner key={`${ex.id}:${idx}`} ex={ex} mode={mode} position={`${idx + 1}/${queue.length}`} onNext={next} onRecorded={recordInSession} autoAdvance={auto} sessionStart={sessionStart} showSessionTimer={mode === "focus" && timer} />
    </div>
  );
}

function SessionRoute() {
  const query = useSearchParams();
  const { ready } = useApp();
  // A changed chapter, level or mode starts a fresh UI session. The provider and
  // its saved attempts stay mounted; only the fixed queue and timers restart.
  const identity = JSON.stringify(["mode", "book", "chapter", "id", "ids", "min", "level"].map(key => query.get(key)));
  if (!ready) return <p className={styles.loading} role="status">Preparing your study space…</p>;
  return <Session key={identity} />;
}

export default function TrainPage() {
  return <Suspense fallback={<p className={styles.loading} role="status">Preparing your study space…</p>}><SessionRoute /></Suspense>;
}

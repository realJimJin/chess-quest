"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { computeStats } from "@/lib/progress";
import { isTrainable } from "@/lib/validate";
import { SHELF, type ShelfBook } from "@/lib/profile";

const AREA: Record<string, string> = { calculation: "Deep calculation", positional: "Positional understanding", endgames: "Endgames", repertoire: "Opening repertoire", games: "Games" };

function Cover({ b, owned, pct }: { b: ShelfBook; owned: boolean; pct: number }) {
  // Original typographic covers; these are not the publishers' cover art.
  return (
    <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-md shadow-lg shadow-black/40 transition group-hover:-translate-y-1 ${owned ? "" : "opacity-55 grayscale-[35%]"}`}
      style={{ background: `linear-gradient(155deg, hsl(${b.hue} 42% 26%), hsl(${b.hue + 25} 48% 12%))` }}>
      <div className="absolute inset-y-0 left-0 w-2.5 bg-black/30" />
      <div className="absolute right-3 top-3 text-3xl opacity-25">♞</div>
      <div className="absolute inset-x-5 top-7"><div className="text-[9px] uppercase tracking-[.2em] text-white/60">{AREA[b.area]}</div>
        <div className="mt-2 text-[15px] font-semibold leading-tight text-white">{b.title}</div><div className="mt-1 text-[11px] text-white/70">{b.author}</div></div>
      <div className="absolute inset-x-5 bottom-4">{owned
        ? <><div className="h-1 overflow-hidden rounded-full bg-black/40"><div className="h-full bg-white/80" style={{ width: `${pct}%` }} /></div><div className="mt-1 text-[10px] text-white/70">{pct}% solved</div></>
        : <div className="text-[10px] uppercase tracking-wider text-white/60">Not in your library</div>}</div>
    </div>);
}

export default function LibraryPage() {
  const { library, exercises, progress } = useApp();
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const pool = useMemo(() => exercises.filter(isTrainable), [exercises]);
  const st = computeStats(progress, pool, now);
  const extra: ShelfBook[] = Object.values(library).filter((l) => !SHELF.some((s) => s.id === l.book.id)).map((l) => ({ id: l.book.id, title: l.book.title, author: l.book.author, area: "calculation", lesson: l.book.id === "samples" ? "Original sample puzzles" : "Playable puzzles", hue: l.book.id === "samples" ? 150 : 190 }));
  const shelf = [...SHELF, ...extra];
  const cur = shelf.find((b) => b.id === (open ?? shelf.find((b) => library[b.id])?.id));
  const lib = cur ? library[cur.id] : undefined;
  const chapters = lib ? [...new Map(lib.exercises.map((e) => [e.chapter.id, e.chapter.title])).entries()] : [];
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Library</h1><p className="text-sm text-mute">Your books, converted into playable courses. Only books you import contain exercises.</p></div>
        <Link href="/import" className="btn btn-primary">Import a book</Link>
      </div>
      <section className="rounded-2xl border border-line p-5" style={{ background: "linear-gradient(180deg,#14171c,#0f1216)" }}>
        <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9" data-testid="shelf">
          {shelf.length === 0 && <p className="col-span-full py-6 text-center text-sm text-mute">Your shelf is empty. Import a book, or load the sample pack from the World screen.</p>}
          {shelf.map((b) => { const l = library[b.id]; const ok = l?.exercises.filter(isTrainable) ?? []; const pct = ok.length ? Math.round((ok.filter((e) => st.doneIds.has(e.id)).length / ok.length) * 100) : 0; return (
            <button key={b.id} className="group text-left" onClick={() => setOpen(b.id)} data-testid={`cover-${b.id}`}><Cover b={b} owned={Boolean(l)} pct={pct} /></button>); })}
        </div>
        <div className="mt-4 h-2 rounded-full bg-gradient-to-b from-[#3a2f24] to-[#1f1912]" />
      </section>
      {cur && (
        <section className="card p-5" data-testid="book-detail">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{cur.title}</h2><p className="text-sm text-mute">{cur.author}{lib ? ` · ${lib.book.edition}` : ""}</p>
              <p className="mt-1 text-xs text-mute">Lesson type: {cur.lesson}</p></div>
            {lib ? <div className="flex gap-2"><Link className="btn btn-primary" href="/">Campaign map</Link><Link className="btn" href={`/train?mode=flow&book=${cur.id}`}>Continue</Link></div> : <Link className="btn" href="/import">Add your copy</Link>}
          </div>
          {!lib && <p className="mt-4 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-mute">This title is on your study plan but not in your library. {cur.area === "calculation" ? "Its exercises can go through the same importer as any diagram-and-solution book." : `Its lesson type (${cur.lesson.toLowerCase()}) is not built yet; today the importer handles diagram-and-solution exercise books.`}</p>}
          {lib && (<>
            <p className="mt-3 text-xs text-mute">{lib.exercises.length} exercises{lib.exercises.some((e) => e.synthetic) ? "" : " from your PDF"} · {lib.exercises.filter(isTrainable).length} validated · {lib.exercises.length - lib.exercises.filter(isTrainable).length} awaiting your review. {lib.exercises.some((e) => e.synthetic) ? "These are original sample puzzles written for the app, not positions from a book." : "All positions are the book's own; none are generated."}</p>
            <div className="mt-4 flex flex-col gap-2">
              {chapters.map(([cid, title]) => { const inChap = lib.exercises.filter((e) => e.chapter.id === cid); const ok = inChap.filter(isTrainable); const solved = ok.filter((e) => st.doneIds.has(e.id)).length; return (
                <div key={cid} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{title} <span className="ml-2 text-xs text-mute">№ {inChap[0]?.number}–{inChap[inChap.length - 1]?.number}</span></span>
                    <span className="flex gap-1.5"><Link className="chip" href={`/train?mode=flow&book=${cur.id}&chapter=${cid}`}>Flow</Link><Link className="chip" href={`/train?mode=deep&book=${cur.id}&chapter=${cid}`}>Deep</Link><Link className="chip" href={`/train?mode=focus&book=${cur.id}&chapter=${cid}`}>Focus</Link></span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-accent" style={{ width: ok.length ? `${(solved / ok.length) * 100}%` : 0 }} /></div>
                  <div className="mt-1 text-xs text-mute">{solved}/{ok.length} solved{inChap.length > ok.length ? ` · ${inChap.length - ok.length} need review` : ""}</div>
                </div>); })}
            </div>
            {lib.exercises.length > lib.exercises.filter(isTrainable).length && <p className="mt-3 text-sm text-warn"><Link className="underline" href="/import#review">Review the flagged exercises</Link> to bring them into the course.</p>}
          </>)}
        </section>)}
    </div>
  );
}

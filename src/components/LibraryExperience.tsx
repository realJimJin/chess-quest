"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { computeStats } from "@/lib/progress";
import { isTrainable } from "@/lib/validate";
import { SAMPLE_PACK } from "@/lib/samples";
import type { Mode } from "@/lib/types";
import type { LibraryBook } from "@/lib/library";
import CourseCover from "./CourseCover";
import QuestIcon from "./QuestIcon";

const STARTER: LibraryBook = { book: SAMPLE_PACK.book, exercises: SAMPLE_PACK.exercises, importedAt: 0 };
export default function LibraryExperience() {
  const router = useRouter();
  const { ready, library, progress, importBook } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "originals" | "imports">("all");
  const [selected, setSelected] = useState("samples");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const books = useMemo(() => [library.samples ?? STARTER, ...Object.values(library).filter(b => b.book.id !== "samples")], [library]);
  const pool = useMemo(() => books.flatMap(b => b.exercises).filter(isTrainable), [books]);
  const stats = useMemo(() => computeStats(progress, pool, now), [progress, pool, now]);
  const visible = books.filter(b => (filter === "all" || (filter === "originals" ? b.book.id === "samples" : b.book.id !== "samples")) && `${b.book.title} ${b.book.author} ${b.book.id === "samples" ? "The Starter Collection" : ""}`.toLowerCase().includes(query.toLowerCase()));
  const current = visible.find(b => b.book.id === selected) ?? visible[0];
  const chapters = current ? [...new Map(current.exercises.map(e => [e.chapter.id, e.chapter.title])).entries()] : [];
  const launch = async (book: LibraryBook, mode: Mode | "map", chapter?: string) => {
    if (pending || !ready) return;
    setPending(true); setError("");
    try {
      if (!library[book.book.id]) await importBook(book.book, book.exercises);
      const params = new URLSearchParams({ book: book.book.id });
      if (mode !== "map") params.set("mode", mode);
      if (chapter) params.set("chapter", chapter);
      router.push(`${mode === "map" ? "/world" : "/train"}?${params}`);
    } catch { setError("Your collection could not be opened. Please try again; your existing progress is safe."); }
    finally { setPending(false); }
  };
  return <div className="library-experience">
    <div className="page-heading"><div><p className="eyebrow">A PLACE TO BECOME BETTER</p><h1>Your library</h1></div><Link className="btn" href="/import"><QuestIcon name="plus" /> Import your own</Link></div>
    <section className="library-hero">
      <div className="hero-copy"><span className="edition-label"><span /> THE STARTER COLLECTION</span><h2>Great moves begin<br />with a little <em>study.</em></h2><p>Slow down. See the possibilities. Build your calculation with eight original positions, one thoughtful move at a time.</p>
        <button className="btn btn-primary hero-cta" data-testid="start-studying" disabled={pending || !ready} onClick={() => launch(books[0], "flow")}>{pending ? "Opening…" : "Start studying"}<QuestIcon name="arrow" /></button>
        <div className="hero-facts"><span><QuestIcon name="book" /> 8 original puzzles</span><span><QuestIcon name="shield" /> No account needed</span></div>
      </div>
      <div className="hero-book-scene"><div className="book-orbit orbit-one" /><div className="book-orbit orbit-two" /><div className="hero-book"><CourseCover title="Sample Pack" author="Chess Quest" original /></div><span className="hero-caption">SMALL BEGINNINGS. DEEPER UNDERSTANDING.</span></div>
    </section>
    {error && <p role="alert" className="notice-error">{error}</p>}
    <section className="study-overview" aria-label="Your study progress"><div><span className="overview-number">{pool.filter(e => stats.doneIds.has(e.id)).length}<span> / {pool.length}</span></span><span className="overview-label">Positions completed</span></div><div><span className="overview-number">{stats.streak}<span> {stats.streak === 1 ? "day" : "days"}</span></span><span className="overview-label">Current study streak</span></div><div><span className="overview-number">{stats.due}</span><span className="overview-label">Due for review</span></div><Link href="/today" className="overview-link">Your training plan <QuestIcon name="arrow" /></Link></section>
    <div className="library-toolbar"><div className="library-tabs" role="group" aria-label="Filter collections">{([['all','All collections'],['originals','Originals'],['imports','My imports']] as const).map(([key,label]) => <button key={key} onClick={() => setFilter(key)} aria-pressed={filter===key}>{label}</button>)}</div><label className="library-search"><QuestIcon name="search" /><input aria-label="Search your library" placeholder="Find a collection…" value={query} onChange={e=>setQuery(e.target.value)} /></label></div>
    <div className="library-body">
      <section className="collection-list" aria-label="Collections" data-testid="shelf">
        {visible.length === 0 && <div className="card empty-library"><QuestIcon name="book" /><h2>{query ? "No matching collections" : "Make room for your books"}</h2><p>{query ? "Try another title or author." : "Import a private exercise collection, or start with the originals."}</p>{query ? <button className="btn" onClick={()=>setQuery("")}>Clear search</button> : <Link className="btn" href="/import">Import a collection</Link>}</div>}
        {visible.map(b => {
          const valid=b.exercises.filter(isTrainable), done=valid.filter(e=>stats.doneIds.has(e.id)).length;
          const chapterCount=new Set(b.exercises.map(e=>e.chapter.id)).size;
          return <button key={b.book.id} className="collection-row" data-selected={current?.book.id===b.book.id} data-testid={`cover-${b.book.id}`} onClick={()=>setSelected(b.book.id)} aria-pressed={current?.book.id===b.book.id}><div className="shelf-cover"><CourseCover title={b.book.title} author={b.book.author} original={b.book.id==="samples"} /></div><div className="collection-info"><span className="eyebrow">{b.book.id==="samples" ? "CHESS QUEST ORIGINALS" : "PRIVATE COLLECTION"}</span><h2>{b.book.id==="samples" ? "The Starter Collection" : b.book.title}</h2><p>{b.book.id==="samples" ? "Checkmate patterns · Calculation" : b.book.author || "Your imported study material"}</p><span className="collection-count">{valid.length} verified {valid.length===1?"position":"positions"} · {chapterCount} {chapterCount===1?"chapter":"chapters"}</span><div className="course-progress"><span style={{width:`${valid.length?done/valid.length*100:0}%`}} /></div><span className="progress-caption">{done} of {valid.length} completed</span></div><QuestIcon name="arrow" /></button>;
        })}
      </section>
      {current && <aside className="chapter-panel" data-testid="book-detail"><div className="chapter-panel-heading"><span className="eyebrow">INSIDE THE COLLECTION</span><h2>{current.book.id==="samples" ? "Your first chapter" : current.book.title}</h2><p>{current.book.id==="samples" ? "Original positions written for Chess Quest. A small collection with plenty to discover." : current.book.author}</p></div><div className="chapter-list">{chapters.map(([id,title],index)=>{
        const all=current.exercises.filter(e=>e.chapter.id===id), valid=all.filter(isTrainable), completed=valid.filter(e=>stats.doneIds.has(e.id)).length;
        return <div className="chapter-row" key={id}><span className="chapter-number">{String(index+1).padStart(2,"0")}</span><div><h3>{title}</h3><p>{completed}/{valid.length} completed{all.length>valid.length?` · ${all.length-valid.length} need review`:""}</p><div className="chapter-actions"><button disabled={!ready||pending||!valid.length} onClick={()=>launch(current,"flow",id)}>Study <span>↗</span></button><button disabled={!ready||pending||!valid.length} onClick={()=>launch(current,"deep",id)}>Calculate <span>↗</span></button><button disabled={!ready||pending||!valid.length} onClick={()=>launch(current,"focus",id)}>Focus <span>↗</span></button></div></div></div>;
      })}</div><button className="map-link" disabled={!ready||pending||!current.exercises.some(isTrainable)} onClick={()=>launch(current,"map")}><QuestIcon name="map" /><span>Explore this collection’s map<small>A different view of your progress</small></span><QuestIcon name="arrow" /></button>{current.exercises.some(e=>!isTrainable(e)) && <Link className="review-link" href="/import#review">Review flagged exercises →</Link>}</aside>}
    </div>
    <Link className="battle-discovery" href="/battles"><QuestIcon name="swords" /><span><strong>Study together. Rise together.</strong><small>Explore Book Battles · Design preview</small></span><QuestIcon name="arrow" /></Link>
    <section className="practice-options" aria-label="Ways to study"><div><QuestIcon name="target" /><h3>Play the whole idea.</h3><p>Work through complete lines on the board. Every reply matters.</p></div><div><QuestIcon name="clock" /><h3>Give the position time.</h3><p>Lock the board, record your candidates, and calculate before you move.</p></div><div><QuestIcon name="spark" /><h3>Learn from what you miss.</h3><p>Return to difficult positions with spaced review and grounded feedback.</p></div></section>
  </div>;
}

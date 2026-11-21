/* eslint-disable @next/next/no-img-element */
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
const titleOf = (b: LibraryBook) => b.book.id === "samples" ? "The Starter Collection" : b.book.title;

export default function LibraryExperience() {
  const router = useRouter();
  const { ready, library, progress, importBook } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "originals" | "imports">("all");
  const [selected, setSelected] = useState("samples");
  const [opened, setOpened] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const books = useMemo(() => [library.samples ?? STARTER, ...Object.values(library).filter(b => b.book.id !== "samples")], [library]);
  const pool = useMemo(() => books.flatMap(b => b.exercises).filter(isTrainable), [books]);
  const stats = useMemo(() => computeStats(progress, pool, now), [progress, pool, now]);
  const visible = books.filter(b => (filter === "all" || (filter === "originals" ? b.book.id === "samples" : b.book.id !== "samples")) && `${titleOf(b)} ${b.book.author} ${b.book.title}`.toLowerCase().includes(query.toLowerCase()));
  const current = visible.find(b => b.book.id === selected) ?? visible[0];
  const chapters = current ? [...new Map(current.exercises.map(e => [e.chapter.id, e.chapter.title])).entries()] : [];
  const valid = current?.exercises.filter(isTrainable) ?? [];
  const done = valid.filter(e => stats.doneIds.has(e.id)).length;
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
    <div className="page-heading"><div><p className="eyebrow">YOUR NEXT GOOD MOVE STARTS HERE</p><h1>The library<span>.</span></h1><p>Read with intention. Practice on the board.</p></div><Link className="btn" href="/import"><QuestIcon name="plus" />Import a book <small>PRIVATE</small></Link></div>
    {error && <p role="alert" className="notice-error">{error}</p>}
    <div className="library-toolbar"><div className="library-tabs" role="group" aria-label="Filter collections">{([['all','My books'],['originals','Originals'],['imports','My imports']] as const).map(([key,label]) => <button key={key} aria-label={key === "all" ? "All collections" : label} onClick={() => setFilter(key)} aria-pressed={filter===key}>{label}{key === "all" && <span>{String(books.length).padStart(2,"0")}</span>}</button>)}</div><label className="library-search"><QuestIcon name="search" /><input aria-label="Search your library" placeholder="Search your library" value={query} onChange={e=>setQuery(e.target.value)} /></label></div>
    {visible.length > 1 && <div className="book-switcher" aria-label="Choose a collection">{visible.map(b => <button key={b.book.id} aria-pressed={current?.book.id===b.book.id} onClick={() => {setSelected(b.book.id);setOpened(true);}}>{titleOf(b)}</button>)}</div>}
    {current ? <div className="library-body">
      <section className="collection-list" aria-label="Collections" data-testid="shelf"><div className="collection-feature">
        <button className="cover-display" data-testid={`cover-${current.book.id}`} aria-label={`Open ${titleOf(current)}`} aria-expanded={opened} onClick={() => setOpened(!opened)}><CourseCover title={current.book.title} author={current.book.author} original={current.book.id === "samples"} /></button>
        <div className="collection-info"><p className="edition-label">{current.book.id === "samples" ? "CHESS QUEST ORIGINAL" : "PRIVATE COLLECTION"}</p><button onClick={() => setOpened(!opened)}><h2>{titleOf(current)}</h2></button><p className="collection-author">by {current.book.id === "samples" ? "Chess Quest" : current.book.author || "Your library"}</p><p className="collection-description">{current.book.id === "samples" ? "A considered first step. Eight original, verified positions to sharpen your eye for the board." : "Your private study collection. Open a chapter and work through its verified positions."}</p><p className="collection-count">{valid.length} puzzles <span>/</span> {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}</p><div className="collection-progress"><p><span>{!done ? "Not started" : done === valid.length ? "Completed" : "In progress"}</span><span>{done} / {valid.length}</span></p><div className="course-progress"><span style={{width: `${valid.length ? done / valid.length * 100 : 0}%`}} /></div><button className="btn btn-primary" data-testid="start-studying" disabled={pending || !ready || !valid.length} onClick={() => launch(current,"flow")}>{pending ? "Opening…" : done ? "Continue studying" : "Start studying"}<QuestIcon name="arrow" /></button></div></div>
      </div>
      {opened && <section className="chapter-panel" data-testid="book-detail"><div className="chapter-panel-heading"><h3 className="eyebrow">IN THIS BOOK</h3><span>{String(chapters.length).padStart(2,"0")} {chapters.length === 1 ? "CHAPTER" : "CHAPTERS"}</span></div><div className="chapter-list">{chapters.map(([id,title],index) => {
        const all=current.exercises.filter(e=>e.chapter.id===id), trainable=all.filter(isTrainable), completed=trainable.filter(e=>stats.doneIds.has(e.id)).length;
        return <div className="chapter-row" key={id}><span className="chapter-number">{String(index+1).padStart(2,"0")}</span><div><h3>{title}</h3><p>{trainable.length} verified positions · {completed} completed{all.length>trainable.length?` · ${all.length-trainable.length} need review`:""}</p><div className="chapter-actions"><button disabled={!ready||pending||!trainable.length} onClick={()=>launch(current,"flow",id)}>Study <span>↗</span></button><button disabled={!ready||pending||!trainable.length} onClick={()=>launch(current,"deep",id)}>Calculate <span>↗</span></button><button disabled={!ready||pending||!trainable.length} onClick={()=>launch(current,"focus",id)}>Focus <span>↗</span></button></div></div><button className="chapter-open" aria-label={`Open chapter ${title}`} disabled={!ready||pending||!trainable.length} onClick={()=>launch(current,"flow",id)}><QuestIcon name="arrow" /></button></div>;
      })}</div><p className="library-storage-note">Your library and study progress are saved on this device.</p>{current.exercises.some(e=>!isTrainable(e)) && <Link className="review-link" href="/import#review">Review flagged exercises →</Link>}</section>}
      </section>
      <aside className="library-discovery"><p className="eyebrow">A DIFFERENT PERSPECTIVE</p><button className="journey-card" disabled={!ready||pending||!valid.length} onClick={()=>launch(current,"map")} aria-label="Explore this collection’s map"><img src="/art/figma-make/journey.png" width="1536" height="1024" alt="An illuminated academy and stone bridges in a moonlit island landscape" /><span><QuestIcon name="arrow" /></span></button><h3>Meet your next milestone.</h3><p>Explore the collection from a new angle. Your book, mapped into a world of its own.</p><button className="text-action" disabled={!ready||pending||!valid.length} onClick={()=>launch(current,"map")}>Explore Journey <QuestIcon name="arrow" /></button><div className="discovery-section"><h3><QuestIcon name="swords" />Study becomes a shared challenge.</h3><p>Same book. Same positions. A different kind of match.</p><Link className="text-action" href="/battles">Discover Book Battles <small>PREVIEW</small></Link></div><div className="discovery-section"><h3>Your next study session</h3><p>{stats.due} positions ready for review. A plan drawn from your library and progress.</p><Link className="text-action" href="/today">Your training plan <QuestIcon name="arrow" /></Link></div></aside>
    </div> : <div className="empty-library"><h2>{query ? "No matching collections" : "Make room for your books"}</h2><p>{query ? "Try another title or author." : "Import a private exercise collection, or start with the originals."}</p>{query ? <button className="btn" onClick={()=>setQuery("")}>Clear search</button> : <Link className="btn" href="/import">Import a collection</Link>}</div>}
  </div>;
}

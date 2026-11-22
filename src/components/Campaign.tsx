"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useProfile } from "@/lib/useProfile";
import { computeStats } from "@/lib/progress";
import { isTrainable } from "@/lib/validate";
import { buildCampaign, PASS_RATIO } from "@/lib/game";
import { SAMPLE_PACK } from "@/lib/samples";
import type { Mode } from "@/lib/types";
import type { LibraryBook } from "@/lib/library";
import WorldMap from "./WorldMap";
import QuestIcon from "./QuestIcon";

const STARTER: LibraryBook = { book:SAMPLE_PACK.book,exercises:SAMPLE_PACK.exercises,importedAt:0 };
export default function World() {
  const { ready, library, progress, importBook } = useApp();
  const query = useSearchParams(); const router = useRouter();
  const [profile,setProfile] = useProfile();
  const [now] = useState(()=>Date.now());
  const [picked,setPicked] = useState<string|null>(null);
  const [bookId,setBookId] = useState<string|null>(null);
  const [opening,setOpening] = useState(false); const [error,setError] = useState("");
  const books = useMemo(()=>[library.samples ?? STARTER,...Object.values(library).filter(b=>b.book.id!=="samples" && b.exercises.some(isTrainable))],[library]);
  const active = books.find(b=>b.book.id === (bookId ?? query.get("book"))) ?? books[0];
  const pool = active.exercises.filter(isTrainable);
  const stats = computeStats(progress,pool,now);
  const camp = buildCampaign(active.book.id,active.exercises,stats.doneIds,profile.freeRoam);
  const sel = camp.levels.find(l=>l.id===picked) ?? camp.current ?? camp.levels.at(-1);
  const title = active.book.id === "samples" ? "The Starter Collection" : active.book.title;
  const launch = async(mode:Mode) => {
    if (!ready||opening||!sel||sel.state==="locked") return;
    setOpening(true);setError("");
    try {
      if (!library[active.book.id]) await importBook(active.book,active.exercises);
      router.push(`/train?${new URLSearchParams({mode,level:sel.id,book:active.book.id})}`);
    } catch {setError("This level could not be opened. Your progress is safe; please try again.");setOpening(false);}
  };
  if (!ready) return <p className="py-20 text-center text-mute" role="status">Loading your world…</p>;
  return <section className="journey-scene">
    <WorldMap camp={camp} selectedId={sel?.id??null} onPick={setPicked} />
    <div className="journey-top"><div><Link className="btn journey-back" href="/library"><QuestIcon name="arrow" />Back to the book</Link><h1>{active.book.id==="samples"?"The foundations":title}</h1><p>{title} · Your learning journey</p>{books.length>1&&<select className="field" aria-label="Choose a collection for the map" value={active.book.id} onChange={e=>{setBookId(e.target.value);setPicked(null);}}>{books.map(b=><option key={b.book.id} value={b.book.id}>{b.book.id==="samples"?"The Starter Collection":b.book.title}</option>)}</select>}</div><div className="journey-progress"><span>Positions completed</span><strong>{pool.filter(e=>stats.doneIds.has(e.id)).length} / {pool.length}</strong></div></div>
    {sel && <div className="journey-level-panel" data-testid="level-panel"><p className="eyebrow">{camp.regions.find(r=>r.chapterId===sel.chapterId)?.title} · {sel.state === "cleared" ? "COMPLETED" : "YOUR NEXT MILESTONE"}</p><h2>{active.book.id==="samples"?"A clear line to the king.":`Level ${sel.index+1}`}</h2><p>{sel.solved}/{sel.exerciseIds.length} positions completed · clears at {Math.ceil(sel.exerciseIds.length*PASS_RATIO)}. {sel.boss?"This chapter’s final challenge.":`Exercises ${sel.firstNumber}–${sel.lastNumber}.`}</p>{sel.state === "locked" ? <p className="journey-locked">Clear the previous level to open this one, or enable free roam.</p> : <div className="journey-actions"><button className="btn btn-primary" data-testid="level-flow" disabled={opening} onClick={()=>launch("flow")}>{opening?"Opening…":"Train this level"}<QuestIcon name="arrow" /></button><button className="text-action" onClick={()=>launch("deep")} disabled={opening}>Calculate</button><button className="text-action" onClick={()=>launch("focus")} disabled={opening}>Focus</button></div>}<label className="journey-free-roam"><input type="checkbox" checked={profile.freeRoam} onChange={e=>setProfile({...profile,freeRoam:e.target.checked})} />Free roam — open every level</label>{error&&<p className="notice-error" role="alert">{error}</p>}</div>}
  </section>;
}

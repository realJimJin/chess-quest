"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Board from "@/components/Board";
import CourseCover from "@/components/CourseCover";
import QuestIcon from "@/components/QuestIcon";
import { SAMPLE_PACK } from "@/lib/samples";
import { useApp } from "@/lib/store";
import { isTrainable } from "@/lib/validate";
import styles from "./battles.module.css";

type Format = "rush" | "calculation";
type Stage = "collection" | "lobby" | "match" | "results";
const STAGES: {id:Stage;label:string}[] = [{id:"collection",label:"Collection"},{id:"lobby",label:"Lobby"},{id:"match",label:"Match"},{id:"results",label:"Results"}];
const EXERCISES = SAMPLE_PACK.exercises.filter(isTrainable);
const CHAPTERS = [...new Map(EXERCISES.map(ex=>[ex.chapter.id,ex.chapter.title])).entries()];

export default function BattlePreview() {
  const { ready, library, importBook } = useApp(); const router = useRouter();
  const [stage,setStage] = useState<Stage>("match");
  const [format,setFormat] = useState<Format>("rush");
  const [chapter,setChapter] = useState(CHAPTERS[0]?.[0]??"");
  const [notes,setNotes] = useState("");
  const [opening,setOpening] = useState(false); const [error,setError] = useState("");
  const positions = EXERCISES.filter(ex=>ex.chapter.id===chapter);
  const exercise = format === "calculation" ? positions.find(ex=>ex.solution.some(n=>n.children.length>0))??positions[0] : positions[0];
  const privateBooks = Object.values(library).filter(b=>b.book.id!==SAMPLE_PACK.book.id);
  const practice = async()=>{
    if (!ready||opening||!exercise) return;
    setOpening(true);setError("");
    try {
      if (!library[SAMPLE_PACK.book.id]) await importBook(SAMPLE_PACK.book,SAMPLE_PACK.exercises);
      router.push(`/train?${new URLSearchParams({mode:format==="calculation"?"deep":"flow",id:exercise.id,book:SAMPLE_PACK.book.id})}`);
    } catch {setError("Solo practice could not be opened. Please try again.");setOpening(false);}
  };
  const previewBoard = <div className={styles.boardColumn}><div className={`${styles.playerBar} ${styles.opponent}`}><span>Opponent slot <small>NOT CONNECTED</small></span><span>—:—</span></div>{exercise&&<Board fen={exercise.fen} orientation={exercise.sideToMove} interactive={false} />}<div className={`${styles.playerBar} ${styles.you}`}><span>You <small>PREVIEW</small></span><span>—:—</span></div><p className={styles.quiet}>No opponent or running clock. Open solo practice to solve this position.</p></div>;
  return <div className={styles.battles}>
    <div className="page-heading"><div><p className="eyebrow">COMPETITIVE STUDY / PREVIEW</p><h1>Book Battles</h1><p>One collection. Two perspectives. Every move considered.</p></div><Link href="/" className="btn">← Back to library</Link></div>
    <nav className={styles.stageNav} aria-label="Book Battles preview screens">{STAGES.map(item=><button key={item.id} onClick={()=>setStage(item.id)} aria-current={stage===item.id?"step":undefined}>{item.label}</button>)}</nav>
    {stage === "match" && <div className={styles.matchGrid}>{previewBoard}<aside className={styles.studyRoom}><h2><QuestIcon name="swords" />The study room</h2><div className={styles.book}><div className={styles.cover}><CourseCover title={SAMPLE_PACK.book.title} author={SAMPLE_PACK.book.author} original /></div><div><h3>The Starter Collection</h3><p>Chess Quest</p></div></div><dl>{[["Chapter",CHAPTERS.find(([id])=>id===chapter)?.[1]??""],["Format",format==="rush"?"Book Rush":"Calculation Duel"],["Connection","Offline preview"],["Scores","Not recorded"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{format === "calculation" && <label className={styles.notes}>Your calculation<textarea className="field" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Candidates, replies, and evaluation…" /><small>Scratch notes for this preview. Nothing is submitted or saved.</small></label>}<div className={styles.disclosure}><h3>A preview, not a live match.</h3><p>Explore the battle layout with an original puzzle. Multiplayer and matchmaking are not connected.</p><button className="btn btn-primary" onClick={practice} disabled={!ready||opening||!exercise}>{opening?"Opening…":"Practice this position solo"}<QuestIcon name="arrow" /></button><button className="text-action" onClick={()=>setStage("results")}>Preview the results →</button></div></aside></div>}
    {stage === "collection" && <section className={styles.setup}><div><p className="eyebrow">CHOOSE A FORMAT</p><h2>Set up your study room.</h2><div className={styles.formats}>{([['rush','Book Rush','Find the whole line. Every move counts.'],['calculation','Calculation Duel','Record your candidates and compare ideas.']] as const).map(([id,title,description])=><button key={id} aria-pressed={format===id} onClick={()=>setFormat(id)}><strong>{title}</strong><span>{description}</span></button>)}</div><label className={styles.chapter}>Chapter<select className="field" value={chapter} onChange={e=>setChapter(e.target.value)}>{CHAPTERS.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>{privateBooks.length>0&&<div className={styles.privateCollections}><p className="eyebrow">YOUR PRIVATE COLLECTIONS</p>{privateBooks.map(b=><p key={b.book.id}>{b.book.title}<small>Solo study only</small></p>)}<p>Shared access must be verified before private books can enter a battle.</p></div>}<button className="btn btn-primary" onClick={()=>setStage("lobby")}>Preview the lobby <QuestIcon name="arrow" /></button></div><aside className={styles.collectionAside}><div className={styles.largeCover}><CourseCover title={SAMPLE_PACK.book.title} author={SAMPLE_PACK.book.author} original /></div><h3>The Starter Collection</h3><p>{positions.length} verified original positions</p><p>Design preview. No room or invitation is created.</p></aside></section>}
    {stage === "lobby" && <section className={styles.lobby}><p className="eyebrow">LOBBY PREVIEW</p><h2>The study room</h2><div className={styles.lobbyPlayers}><div className={styles.you}><QuestIcon name="knight" /><h3>You</h3><p>Player preview</p></div><span>VS</span><div className={styles.opponent}><QuestIcon name="knight" /><h3>Opponent</h3><p>No player connected</p></div></div><p>The Starter Collection · {format==="rush"?"Book Rush":"Calculation Duel"}</p><div className={styles.lobbyActions}><button className="btn" disabled>Invite a friend · unavailable</button><button className="btn btn-primary" onClick={()=>setStage("match")}>Preview the match <QuestIcon name="arrow" /></button></div><p className={styles.quiet}>This is a visual preview. No room, invitation, timer, or score has been created.</p></section>}
    {stage === "results" && <section className={styles.results}><p className="eyebrow">RESULTS PREVIEW</p><h2>Review the match.</h2><p>No match has been played. Results and ratings have not changed.</p><table><caption className="sr-only">Preview match results; no match has been played</caption><thead><tr><th>Match summary</th><th>You</th><th>Opponent</th></tr></thead><tbody>{['Complete solutions','Accuracy','Time used'].map(label=><tr key={label}><th>{label}</th><td>—</td><td>—</td></tr>)}</tbody></table><div className={styles.lobbyActions}><button className="btn" onClick={()=>setStage("collection")}>Choose a format</button><button className="btn btn-primary" onClick={practice} disabled={!ready||opening||!exercise}>{opening?"Opening…":"Study the position solo"}</button></div></section>}
    {error&&<p role="alert" className="notice-error">{error}</p>}
  </div>;
}

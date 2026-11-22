"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "@/components/Board";
import { DAY_LESSONS, stepExplanation, type GuidedLesson } from "@/lib/openings/lessons";
import { STUDY_DAYS } from "@/lib/openings/verified";
import { advanceOpponent, attemptOpeningMove, compileLine, isYourTurn, newSession, positionAt, revealOpeningMove, sessionScore, type OpeningSession } from "@/lib/openings/trainer";
import { emptyOpeningProgress, localOpeningProgressStore, recordOpeningRun, type OpeningProgress, type OpeningProgressStore } from "@/lib/openings/progress";
import styles from "./guided.module.css";

export default function GuidedDay({ day, onExit, progressStore=localOpeningProgressStore }: {day:number;onExit:()=>void;progressStore?:OpeningProgressStore}) {
  const lessons=DAY_LESSONS[day];
  const [index,setIndex]=useState(0);
  const [progress,setProgress]=useState<OpeningProgress>(emptyOpeningProgress);
  const [storageError,setStorageError]=useState("");
  const loaded=useRef(false);
  const title=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    try {
      const saved=progressStore.load();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the existing browser progress store after mounting.
      setProgress(saved);loaded.current=true;
    } catch {setStorageError("Saved progress could not be read. You can still study this lesson.");}
  },[progressStore]);
  useEffect(()=>{title.current?.focus({preventScroll:true});title.current?.scrollIntoView({block:"start",behavior:"instant"});},[index]);
  function save(lesson: GuidedLesson, session: OpeningSession) {
    if(!loaded.current)return; // Never overwrite unreadable existing progress.
    const next=recordOpeningRun(progress,lesson,compileLine(lesson),session,Date.now());
    setProgress(next);
    try {progressStore.save(next);setStorageError("");} catch {setStorageError("This practice result could not be saved. It stays visible for this visit.");}
  }
  return <section className={styles.day} aria-label="Guided opening lesson">
    <div className={styles.heading}>
      <button className="btn btn-ghost" onClick={onExit}>← All days &amp; variations</button>
      <h1 ref={title} tabIndex={-1}>{STUDY_DAYS[day].title}</h1>
      <p>Watch the moves. Understand the idea. Then play the line yourself.</p>
    </div>
    <label className={styles.selector}>Lesson {index+1} of {lessons.length}
      <select className="field" aria-label="Choose lesson" value={index} onChange={e=>setIndex(Number(e.target.value))}>
        {lessons.map((l,i)=><option key={l.id} value={i}>{i+1}. {l.title}{progress.lines[l.id]?.cleanRuns ? " ✓" : ""}</option>)}
      </select>
    </label>
    {storageError && <p role="alert" className="text-sm text-warn">{storageError}</p>}
    <LessonSession key={lessons[index].id} lesson={lessons[index]} initialMode={day===4?"recall":"learn"} onComplete={save}
      onNext={index+1<lessons.length?()=>setIndex(i=>i+1):undefined}/>
    {index+1===lessons.length && <button className="btn" onClick={onExit}>Back to all five days</button>}
  </section>;
}

function LessonSession({lesson,initialMode,onComplete,onNext}:{lesson:GuidedLesson;initialMode:OpeningSession["mode"];onComplete:(l:GuidedLesson,s:OpeningSession)=>void;onNext?:()=>void}) {
  const steps=useMemo(()=>compileLine(lesson),[lesson]);
  const [session,setSession]=useState(()=>newSession(initialMode));
  const [watchPly,setWatchPly]=useState(0);
  const [reviewPly,setReviewPly]=useState<number|null>(null);
  const [playing,setPlaying]=useState(false);
  const [moveText,setMoveText]=useState("");
  const [inputError,setInputError]=useState("");
  const saved=useRef(false);
  const watch=session.mode==="learn";
  const reviewing=!watch&&reviewPly!==null;
  const ply=watch?watchPly:reviewPly??session.ply;
  const done=(watch?watchPly:session.ply)===steps.length;
  const mine=!watch&&!reviewing&&!done&&isYourTurn(steps,lesson.side,session);
  const previous=steps[ply-1];
  const expected=steps[ply];
  const revealed=session.assisted.includes(session.ply);
  const label=(index:number)=>`${Math.floor(index/2)+1}${index%2===0?".":"…"} ${steps[index].san}`;

  const navigate=useCallback((direction:number)=>{
    setPlaying(false);
    if(watch) setWatchPly(p=>Math.max(0,Math.min(p+direction,steps.length)));
    else setReviewPly(p=>{
      const next=Math.max(0,Math.min((p??session.ply)+direction,session.ply));
      return next===session.ply?null:next;
    });
  },[watch,session.ply,steps.length]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      // Leave cursor movement, select options, and other native controls alone.
      const target=event.target;
      if(target instanceof Element&&target.closest("input, textarea, select, [contenteditable], [role=combobox], [role=slider], [role=tab], [role=radio], [role=menuitem]"))return;
      if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
      event.preventDefault();
      navigate(event.key==="ArrowLeft"?-1:1);
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[navigate]);

  useEffect(()=>{
    if(!watch||!playing||done)return;
    const timer=window.setTimeout(()=>setWatchPly(p=>Math.min(p+1,steps.length)),2600);
    return()=>window.clearTimeout(timer);
  },[watch,playing,watchPly,done,steps.length]);
  useEffect(()=>{
    if(watch||reviewing||done||mine)return;
    const timer=window.setTimeout(()=>setSession(s=>advanceOpponent(steps,lesson.side,s)),550);
    return()=>window.clearTimeout(timer);
  },[watch,reviewing,done,mine,session.ply,steps,lesson.side]);
  useEffect(()=>{
    if(watch||!done||saved.current)return;
    saved.current=true;onComplete(lesson,session);
  },[watch,done,onComplete,lesson,session]);

  function mode(next:OpeningSession["mode"]) {
    setPlaying(false);setWatchPly(0);setReviewPly(null);setSession(newSession(next));setMoveText("");setInputError("");saved.current=false;
  }
  function submitText(event:React.FormEvent) {
    event.preventDefault();if(!mine||!expected)return;
    // A text alternative makes practice usable with a keyboard and assistive technology.
    const input=moveText.trim();
    const match=/^([a-h][1-8])\s*[- ]?\s*([a-h][1-8])([qrbn])?$/i.exec(input);
    if(!match){setInputError("Enter two squares, such as d2 d4.");return;}
    setSession(s=>attemptOpeningMove(steps,lesson.side,s,{from:match[1].toLowerCase(),to:match[2].toLowerCase(),promotion:match[3]?.toLowerCase()}));
    setMoveText("");setInputError("");
  }

  return <div className={styles.lesson} data-testid="guided-session" data-mode={session.mode} data-ply={ply}>
    <div className={styles.lessonTop}>
      <h2>{lesson.title}</h2>
      <span>Play as {lesson.side} · {Math.ceil(steps.length/2)} moves</span>
      <div className={styles.modes}><button className="chip" aria-pressed={watch} onClick={()=>mode("learn")}>1. Watch &amp; learn</button><button className="chip" aria-pressed={!watch} onClick={()=>mode("recall")}>2. Practice this line</button></div>
    </div>
    <div className={styles.stage}>
      <div className={styles.board}>
        <Board fen={positionAt(steps,ply)} orientation={lesson.side} interactive={mine}
          onMove={m=>{if(mine)setSession(s=>attemptOpeningMove(steps,lesson.side,s,m));}}
          lastMove={previous?[previous.from,previous.to]:null}
          highlights={!watch&&mine&&revealed?[expected.from,expected.to]:[]}
          arrows={(watch||reviewing)&&previous?[{from:previous.from,to:previous.to}]:!watch&&mine&&revealed?[{from:expected.from,to:expected.to}]:[]}
          resetKey={session.resetKey}/>
      </div>
      <div className={styles.instruction}>
        <div className={styles.explanation} aria-live="polite" aria-atomic="true">
          <p className="label">{reviewing ? ply ? `Review · ${label(ply-1)}` : "Review · Starting position" : watch ? ply ? `${label(ply-1)} · ${previous.side}` : "The idea before the moves" : done ? "Practice complete" : mine ? `Your turn · ${lesson.side}` : "Opponent’s reply"}</p>
          {watch||reviewing ? <p data-testid="lesson-explanation">{ply?stepExplanation(lesson,previous,ply-1):lesson.plan}</p>
            : done ? <p>{sessionScore(steps,lesson.side,session).correct} of {sessionScore(steps,lesson.side,session).total} moves recalled without a hint or retry. {session.mistakes.length||session.assisted.length?"Watch the line again, then repeat the moves you missed.":"Good — you recalled this recorded line."}</p>
            : <p>{mine ? revealed ? `Play ${expected.san}: ${expected.from} → ${expected.to}. ${stepExplanation(lesson,expected,ply)}` : "Tap your piece, then its destination square. The opponent replies automatically." : "Watch the opponent’s move, then choose your reply."}</p>}
          {!watch&&!reviewing&&session.feedback&&<p className="text-sm" role="status">{session.feedback}</p>}
          {watch&&done&&<p className="text-good">You have seen the whole line. Now try it without the moves showing.</p>}
        </div>
        <div className={styles.controls}>
          {watch ? <>
            <button className="btn" aria-keyshortcuts="ArrowLeft" disabled={ply===0} onClick={()=>navigate(-1)}>← Previous</button>
            {!done ? <button className="btn btn-primary" aria-keyshortcuts="ArrowRight" data-testid="show-next-move" onClick={()=>navigate(1)}>Show {label(ply)} →</button>
              : <button className="btn btn-primary" onClick={()=>mode("recall")}>Now play it yourself →</button>}
            {!done&&<button className="btn btn-ghost" onClick={()=>setPlaying(p=>!p)}>{playing?"Pause demonstration":"Play demonstration"}</button>}
          </> : reviewing ? <button className="btn btn-primary" onClick={()=>setReviewPly(null)}>Return to {done?"result":"practice"} →</button>
            : done ? <><button className="btn" onClick={()=>mode("recall")}>Practice again</button>{onNext&&<button className="btn btn-primary" onClick={onNext}>Next lesson →</button>}</>
            : <><button className="btn" disabled={!mine} onClick={()=>setSession(s=>revealOpeningMove(s))}>Show me the move</button><button className="btn btn-ghost" onClick={()=>mode("learn")}>Watch again</button></>}
          {!watch&&<><button className="btn" aria-keyshortcuts="ArrowLeft" disabled={ply===0} onClick={()=>navigate(-1)}>← Previous</button><button className="btn" aria-keyshortcuts="ArrowRight" disabled={!reviewing} onClick={()=>navigate(1)}>Next played move →</button></>}
        </div>
        <p className="text-xs text-mute">{watch?"Keyboard: ← previous move · → next move.":"Keyboard: ← / → review played moves. Return to the latest position to resume practice."}</p>
        {!watch&&!reviewing&&!done&&<details className={styles.textMove}><summary>Enter a move using squares</summary><form onSubmit={submitText}><label>From and to<input className="field" aria-label="Move squares" value={moveText} onChange={e=>setMoveText(e.target.value)} placeholder="d2 d4" autoComplete="off"/></label><button className="btn" disabled={!mine}>Play move</button></form>{inputError&&<p role="alert">{inputError}</p>}</details>}
        {(watch||reviewing)&&ply>0&&<p className={styles.notation}>{steps.slice(0,ply).map((s,i)=>`${i%2===0?`${i/2+1}. `:""}${s.san}`).join(" ")}</p>}
      </div>
    </div>
    <details className={styles.source}><summary>About this opening and source game</summary><p>{lesson.plan}</p><p>{lesson.date} · {lesson.gameType}</p><a href={lesson.source.url} target="_blank" rel="noreferrer">{lesson.source.game} ↗</a><p>Exact moves from this game; original coaching notes by Chess Quest. Other recorded choices remain available in the variation explorer.</p></details>
    {onNext&&watch&&<button className="btn btn-ghost" onClick={onNext}>Skip to next lesson →</button>}
  </div>;
}

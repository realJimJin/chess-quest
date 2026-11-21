"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useProfile } from "@/lib/useProfile";
import { isTrainable } from "@/lib/validate";
import { SAMPLE_PACK } from "@/lib/samples";
import { recommendTraining, type TrainingBlock } from "@/lib/training/recommend";
import { trainingBlockHref } from "./plan";
import QuestIcon from "../QuestIcon";
import styles from "./plan.module.css";

export default function TrainingPlan() {
  const router = useRouter();
  const { ready, library, exercises, progress, importBook } = useApp();
  const [profile] = useProfile();
  const [now] = useState(() => Date.now());
  const [minutes, setMinutes] = useState(60);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const available = useMemo(() => library.samples ? exercises : [...SAMPLE_PACK.exercises, ...exercises], [library.samples, exercises]);
  const plan = useMemo(() => recommendTraining({
    now, profile, sessionMinutes: minutes, attempts: progress.attempts, srs: progress.srs,
    exercises: available.map(ex => ({ id: ex.id, bookId: ex.bookId, chapter: ex.chapter, number: ex.number, difficulty: ex.difficulty.value, trainable: isTrainable(ex), goal: ex.goal })),
    bookAreas: { samples: "calculation" },
  }), [now, profile, minutes, progress, available]);
  const active = plan.blocks.filter(block => block.exerciseIds.length);
  const gaps = plan.blocks.filter(block => !block.exerciseIds.length);
  const openBlock = async (block: TrainingBlock) => {
    const href = trainingBlockHref(block);
    if (!href || opening || !ready) return;
    setOpening(block.id); setError("");
    try {
      if (!library.samples && block.exerciseIds.some(id => SAMPLE_PACK.exercises.some(ex => ex.id === id))) await importBook(SAMPLE_PACK.book, SAMPLE_PACK.exercises);
      router.push(href);
    } catch { setError("This session could not be opened. Your existing library and progress have been kept."); }
    finally { setOpening(null); }
  };
  if (!ready) return <p className={styles.loading} role="status">Preparing your training plan…</p>;
  return <div className={styles.plan}>
    <header className={styles.heading}><div><span className="eyebrow">PURPOSEFUL PRACTICE</span><h1>A little direction.<br />A deeper understanding.</h1><p>Your library, your recorded practice, and the time you have today.</p></div>
      <label className={styles.duration}><QuestIcon name="clock" /><span>Time for study<select className="field" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>{[15, 30, 60, 90, 120].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></span></label>
    </header>
    <section className={styles.overview} aria-label="Plan overview"><div><strong>{plan.evidence.exercisesPlanned}</strong><span>Positions in this plan</span></div><div><strong>{plan.evidence.dueReviews}</strong><span>Due for review</span></div><div><strong>{plan.skill.firstTryAccuracy === null ? "—" : `${Math.round(plan.skill.firstTryAccuracy * 100)}%`}</strong><span>Recorded first-try accuracy</span></div></section>
    {error && <p className="notice-error" role="alert">{error}</p>}
    <div className={styles.columns}><section aria-label="Your recommended sessions"><div className={styles.sectionTitle}><h2>Your next steps</h2><span>{active.length} {active.length === 1 ? "session" : "sessions"}</span></div>
      {!active.length && <div className={styles.empty}><QuestIcon name="book" /><h3>A good place to pause.</h3><p>There are no new positions in this plan. Revisit a chapter from your library or adjust your study time.</p><Link href="/" className="btn">Open your library</Link></div>}
      <ol className={styles.sessions} data-testid="plan">{active.map((block, index) => <li key={block.id} className={styles.session}>
        <div className={styles.sessionTop}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><span className="eyebrow">{block.kind === "due_review" ? "SPACED REVIEW" : block.kind === "weakness_drill" ? "TARGETED PRACTICE" : block.mode === "deep" ? "DEEP CALCULATION" : "CONTINUE STUDYING"}</span><span className={styles.minutes}>{block.minutes} min</span></div>
        <h3>{block.title}</h3><p>{block.exerciseIds.length} verified {block.exerciseIds.length === 1 ? "position" : "positions"}{block.mode === "deep" ? " · with your calculation notebook" : " · one position at a time"}</p>
        <details className={styles.reasons}><summary>Why this session?</summary><ul>{block.reasons.map((reason, i) => <li key={`${reason.code}-${i}`}>{reason.text}</li>)}</ul></details>
        <button className={`btn ${index === 0 ? "btn-primary" : ""}`} disabled={!!opening} onClick={() => openBlock(block)}>{opening === block.id ? "Opening…" : "Begin session"}<QuestIcon name="arrow" /></button>
      </li>)}</ol>
    </section><aside className={styles.sidebar}><section className={styles.basis}><span className="eyebrow">WHAT THE PLAN KNOWS</span><h2>Built on your practice.</h2><p>{plan.evidence.totalAttempts} recorded attempts across {plan.evidence.attemptedExercises} positions.</p><p>{plan.skill.difficulty.provisional ? "Your starting difficulty is provisional. More recorded practice will give the plan a stronger basis." : "Difficulty guidance uses your recorded first attempts and the material available in your library."}</p><Link href="/profile">Adjust your goals and study balance <QuestIcon name="arrow" /></Link></section>
      {gaps.length > 0 && <section className={styles.gaps}><h2>Beyond this session</h2><p>Your study balance includes areas your current library may not cover.</p><ul>{gaps.map(block => <li key={block.id}><strong>{block.title}</strong>{block.minutes > 0 && <span>{block.minutes} min reserved</span>}<p>{block.reasons[0]?.text}</p></li>)}</ul></section>}
      {plan.caveats.length > 0 && <details className={styles.caveats}><summary>How to read this plan</summary><ul>{plan.caveats.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
    </aside></div>
  </div>;
}

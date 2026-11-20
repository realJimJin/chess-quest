"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
const STAGES: { id: Stage; label: string }[] = [
  { id: "collection", label: "Collection" },
  { id: "lobby", label: "Lobby" },
  { id: "match", label: "Match" },
  { id: "results", label: "Results" },
];
const FORMATS: Record<Format, { title: string; description: string; duration: string; icon: "clock" | "target" }> = {
  rush: { title: "Book Rush", description: "Find the whole line. Make every solution count.", duration: "03:00", icon: "clock" },
  calculation: { title: "Calculation Duel", description: "One position. Two minds. Go a little deeper.", duration: "10:00", icon: "target" },
};
// Presentation-only fixtures use the existing authored collection. No match,
// timer, score, invitation, or attempt is created by this preview.
const EXERCISES = SAMPLE_PACK.exercises.filter(isTrainable);
const CHAPTERS = [...new Map(EXERCISES.map(ex => [ex.chapter.id, ex.chapter.title])).entries()];

function Shield({ side, small = false }: { side: "sapphire" | "crimson"; small?: boolean }) {
  return <div className={`${styles.shield} ${styles[side]} ${small ? styles.smallShield : ""}`} aria-hidden="true"><QuestIcon name="knight" /><span>◆</span></div>;
}

function Opponents({ compact = false }: { compact?: boolean }) {
  return <div className={`${styles.versus} ${compact ? styles.compactVersus : ""}`}>
    <div className={styles.player}><Shield side="sapphire" small={compact} /><div><span className={styles.playerLabel}>YOUR SIDE</span><h3>You</h3><p>Player preview</p></div></div>
    <span className={styles.vs}>VS</span>
    <div className={styles.player}><Shield side="crimson" small={compact} /><div><span className={styles.playerLabel}>ACROSS THE BOARD</span><h3>Opponent</h3><p>No player connected</p></div></div>
  </div>;
}

export default function BattlePreview() {
  const { ready, library, importBook } = useApp();
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [stage, setStage] = useState<Stage>("collection");
  const [format, setFormat] = useState<Format>("rush");
  const [chapter, setChapter] = useState(CHAPTERS[0]?.[0] ?? "");
  const [notes, setNotes] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const chosen = FORMATS[format];
  const positions = EXERCISES.filter(ex => ex.chapter.id === chapter);
  const exercise = format === "calculation" ? positions.find(ex => ex.solution.some(node => node.children.length > 0)) ?? positions[0] : positions[0];
  const privateBooks = Object.values(library).filter(item => item.book.id !== SAMPLE_PACK.book.id);
  const show = (next: Stage) => {
    setStage(next);
    // Keep keyboard and screen-reader users at the preview they selected.
    heading.current?.focus();
  };
  const practice = async () => {
    if (!ready || opening || !exercise) return;
    setOpening(true); setError("");
    try {
      if (!library[SAMPLE_PACK.book.id]) await importBook(SAMPLE_PACK.book, SAMPLE_PACK.exercises);
      router.push(`/train?${new URLSearchParams({ mode: format === "calculation" ? "deep" : "flow", id: exercise.id, book: SAMPLE_PACK.book.id })}`);
    } catch {
      setError("Solo practice could not be opened. Please try again.");
      setOpening(false);
    }
  };

  return <div className={styles.battles}>
    <div className="page-heading"><div><p className="eyebrow">IMPROVEMENT, TOGETHER</p><h1>Book Battles</h1></div><Link href="/" className="btn">Back to library</Link></div>
    <div className={styles.previewNotice}><QuestIcon name="shield" /><p><strong>Design preview</strong><span>Explore the experience. Live opponents, invitations, timers, and scoring are not available yet.</span></p></div>
    <nav className={styles.stageNav} aria-label="Book Battles preview screens">
      {STAGES.map((item, index) => <button key={item.id} aria-current={stage === item.id ? "step" : undefined} onClick={() => show(item.id)}><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</button>)}
    </nav>
    <section className={styles.stage} aria-labelledby="battle-stage-title">
      <div className={styles.stageHeading}><span className="eyebrow">{chosen.title.toUpperCase()} · PREVIEW</span><h2 id="battle-stage-title" ref={heading} tabIndex={-1}>{stage === "collection" ? "A shared book. A worthy challenge." : stage === "lobby" ? "The next great rivalry starts here." : stage === "match" ? "Make your thinking count." : "The result is only the beginning."}</h2></div>

      {stage === "collection" && <>
        <div className={styles.formatGrid} aria-label="Choose a battle format">
          {(Object.entries(FORMATS) as [Format, typeof chosen][]).map(([key, value]) => <button key={key} className={styles.format} aria-pressed={format === key} onClick={() => setFormat(key)}><QuestIcon name={value.icon} /><span><strong>{value.title}</strong><small>{value.description}</small></span><span className={styles.radio} aria-hidden="true" /></button>)}
        </div>
        <div className={styles.setupGrid}>
          <div className={styles.collectionPanel}>
            <div className={styles.collectionTitle}><h3>Choose your collection</h3><span>1 preview collection</span></div>
            <div className={styles.bookChoice}><div className={styles.cover}><CourseCover title={SAMPLE_PACK.book.title} author={SAMPLE_PACK.book.author} original /></div><div><span className="eyebrow">CHESS QUEST ORIGINALS</span><h3>The Starter Collection</h3><p>{EXERCISES.length} verified positions · Original puzzles</p><span className={styles.selectedTag}>Selected for preview</span></div></div>
            <label className={styles.chapterChoice}>Chapter<select className="field" value={chapter} onChange={event => setChapter(event.target.value)}>{CHAPTERS.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
            {privateBooks.length > 0 && <div className={styles.privateCollections}><p className="label">Your private collections</p>{privateBooks.map(item => <div key={item.book.id}><QuestIcon name="shield" /><span>{item.book.title}</span><small>Solo study only</small></div>)}<p>Shared access needs to be verified before private books can enter a battle.</p></div>}
          </div>
          <aside className={styles.setupAside}><QuestIcon name="swords" /><h3>Better rivals.<br />Better students.</h3><p>{format === "rush" ? "Race through a shared collection with complete, accurate solutions at the heart of the challenge." : "Give a position your full attention. Record candidates and variations, then compare the ideas that mattered."}</p><dl><div><dt>Collection</dt><dd>{positions.length} verified positions</dd></div><div><dt>Format</dt><dd>{chosen.title}</dd></div><div><dt>Preview clock</dt><dd>{chosen.duration} · paused</dd></div></dl><button className="btn btn-primary" onClick={() => show("lobby")}>Preview the lobby <QuestIcon name="arrow" /></button></aside>
        </div>
        <p className={styles.futureFormats}>On the horizon <span>Endgame Arena</span><span>Book Marathon</span></p>
      </>}

      {stage === "lobby" && <div className={styles.lobby}>
        <Opponents />
        <div className={styles.lobbyCollection}><QuestIcon name="book" /><div><h3>The Starter Collection</h3><p>{CHAPTERS.find(([id]) => id === chapter)?.[1]} · {chosen.title}</p></div><span>{chosen.duration}<small>PREVIEW · PAUSED</small></span></div>
        <div className={styles.lobbyActions}><button className="btn" disabled>Invite a friend · unavailable</button><button className="btn btn-primary" onClick={() => show("match")}>Preview the match <QuestIcon name="arrow" /></button></div>
        <p className={styles.quiet}>This lobby is a visual preview. No room or invitation has been created.</p>
      </div>}

      {stage === "match" && <>
        <Opponents compact />
        <div className={styles.matchGrid}>
          <div><div className={styles.boardHeading}><span>{exercise?.instruction ?? "No verified position"}</span><span>Original position · Preview</span></div>{exercise && <Board fen={exercise.fen} orientation={exercise.sideToMove} interactive={false} />}<p className={styles.quiet}>Board locked for this preview. Open solo practice to solve the position.</p></div>
          <aside className={styles.matchAside}>
            <div className={styles.clock}><QuestIcon name="clock" /><span>{chosen.duration}</span><small>PREVIEW TIMER · PAUSED</small></div>
            <div className={styles.scoreboard}><div><span>You</span><strong>—</strong></div><span>Score</span><div><span>Opponent</span><strong>—</strong></div></div>
            {format === "calculation" ? <label className={styles.notes}>Your calculation<textarea className="field" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Candidate moves, best replies, and your evaluation…" /><small>Scratch notes for this preview. Nothing is submitted or saved.</small></label> : <div className={styles.matchGuidance}><span className="eyebrow">THE WHOLE IDEA MATTERS</span><h3>Find the move.<br />See the reply.</h3><p>In Book Rush, complete solutions belong at the center of the score.</p></div>}
            <button className="btn" disabled>{format === "calculation" ? "Submit calculation · unavailable" : "Submit solution · unavailable"}</button>
            <button className="btn btn-primary" onClick={practice} disabled={!ready || opening || !exercise}>{opening ? "Opening practice…" : "Practice this position solo"}<QuestIcon name="arrow" /></button>
            <button className={styles.textButton} onClick={() => show("results")}>Preview the results →</button>
          </aside>
        </div>
      </>}

      {stage === "results" && <div className={styles.results}>
        <div className={styles.resultsEmblem}><QuestIcon name="swords" /></div><span className="eyebrow">RESULTS PREVIEW</span><h3>More than a score.</h3><p>A place to compare your thinking, revisit missed ideas, and leave a stronger player.</p>
        <table className={styles.resultTable}><caption className="sr-only">Preview match results; no match has been played</caption><thead><tr><th scope="col">Match summary</th><th scope="col">You</th><th scope="col">Opponent</th></tr></thead><tbody>{["Complete solutions", "Accuracy", "Time used"].map(label => <tr key={label}><th scope="row">{label}</th><td>—</td><td>—</td></tr>)}</tbody></table>
        <p className={styles.quiet}>No match has been played. Results and ratings have not changed.</p>
        <div className={styles.resultsActions}><button className="btn" onClick={() => show("collection")}>Choose a format</button><button className="btn btn-primary" onClick={practice} disabled={!ready || opening || !exercise}>{opening ? "Opening practice…" : "Study the position solo"}<QuestIcon name="arrow" /></button></div>
      </div>}
      {error && <p className="notice-error" role="alert">{error}</p>}
    </section>
  </div>;
}

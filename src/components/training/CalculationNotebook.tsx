"use client";

import { useId } from "react";
import type { DeepRecord } from "@/lib/types";
import QuestIcon from "../QuestIcon";
import styles from "./training.module.css";

interface Props {
  phase: "setup" | "think" | "play";
  planned: number;
  remaining: number;
  record: DeepRecord;
  error: string;
  onPlan: (minutes: number) => void;
  onChange: (record: DeepRecord) => void;
  onStart: () => void;
  onCommit: () => void;
}

export default function CalculationNotebook({ phase, planned, remaining, record, error, onPlan, onChange, onStart, onCommit }: Props) {
  const id = useId();
  const seconds = Math.floor(Math.abs(remaining) / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const step = phase === "setup" ? 0 : phase === "think" ? 1 : 2;
  return <section className={styles.notebook} aria-label="Calculation notebook">
    <ol className={styles.steps} aria-label="Calculation stages">
      {["Prepare", "Calculate", "Play your line"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} data-complete={step > index}>
        <span aria-hidden="true">{index + 1}</span>{label}
      </li>)}
    </ol>
    {phase === "setup" && <div className={styles.notebookBody}>
      <span className="eyebrow">THINK BEFORE YOU MOVE</span>
      <h3>A quiet place to calculate.</h3>
      <p>The pieces stay still while you consider your candidates, write your variations, and choose a first move.</p>
      <fieldset className={styles.timeChoices}>
        <legend>Your thinking time</legend>
        <div>{[5, 10, 20, 30].map(minutes => <button type="button" key={minutes} aria-pressed={planned === minutes} onClick={() => onPlan(minutes)}>
          {minutes}<span>min</span>
        </button>)}</div>
      </fieldset>
      <button className="btn btn-primary" data-testid="deep-start" onClick={onStart}>Open calculation notebook <QuestIcon name="arrow" /></button>
      <p className={styles.quietNote}>A guide for your attention. You can keep thinking when the time runs out.</p>
    </div>}
    {phase === "think" && <form className={styles.notebookBody} onSubmit={event => { event.preventDefault(); if (record.finalAnswer.trim()) onCommit(); }}>
      <div className={styles.notebookHeading}><div><span className="eyebrow">YOUR ANALYSIS</span><h3>Find the clearest line.</h3></div>
        <span className={styles.thinkingClock} data-overtime={remaining < 0} aria-label={`${time} ${remaining < 0 ? "over planned time" : "remaining"}`}><QuestIcon name="clock" />{time}{remaining < 0 ? " over" : ""}</span>
      </div>
      <label className={styles.notebookField}><span><b>01</b> Candidate moves</span>
        <input className="field" data-testid="deep-candidates" placeholder="Which moves deserve a closer look?" value={record.candidates} onChange={e => onChange({ ...record, candidates: e.target.value })} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
      </label>
      <label className={styles.notebookField}><span><b>02</b> Variations</span>
        <textarea className={`field ${styles.variations}`} data-testid="deep-lines" placeholder={"Write one line per candidate.\nInclude the opponent’s strongest reply."} value={record.lines} spellCheck={false} onChange={e => onChange({ ...record, lines: e.target.value })} />
      </label>
      <label className={styles.notebookField}><span><b>03</b> Your evaluation</span>
        <select className="field" data-testid="deep-eval" value={record.evaluation} onChange={e => onChange({ ...record, evaluation: e.target.value as DeepRecord["evaluation"] })}>
          <option value="">Choose an evaluation</option><option value="winning">Winning</option><option value="better">Clearly better</option><option value="equal">Equal</option><option value="worse">Worse</option><option value="unclear">Unclear</option>
        </select>
      </label>
      <div className={styles.commitArea}>
        <label className={styles.notebookField}><span>Your first move</span>
          <input className="field" data-testid="deep-answer" placeholder="e.g. Nf3" autoComplete="off" autoCapitalize="off" spellCheck={false} value={record.finalAnswer} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={e => onChange({ ...record, finalAnswer: e.target.value })} />
        </label>
        {error && <p id={`${id}-error`} className={styles.inputError} role="alert">{error}</p>}
        {remaining > planned * 60000 * 0.5 && record.finalAnswer && <p className={styles.quietNote}>There’s time to check the opponent’s best defence once more.</p>}
        <button className="btn btn-primary" type="submit" data-testid="deep-commit" disabled={!record.finalAnswer.trim()}>Commit first move <QuestIcon name="arrow" /></button>
      </div>
    </form>}
    {phase === "play" && <div className={styles.notebookBody}><span className="eyebrow">PUT YOUR ANALYSIS TO THE TEST</span><h3>Play out your idea.</h3><p>The board is now unlocked. Continue your line against the replies in the exercise.</p></div>}
  </section>;
}

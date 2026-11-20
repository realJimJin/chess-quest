"use client";

import { useId, useState } from "react";
import type { MoveInput } from "@/lib/puzzle";
import { parseNotation } from "./notation";
import styles from "./training.module.css";

export default function MoveEntry({ fen, disabled, onMove }: {
  fen: string;
  disabled: boolean;
  onMove: (move: MoveInput) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  return <form className={styles.moveEntry} onSubmit={(event) => {
    event.preventDefault();
    if (disabled) return;
    const move = parseNotation(fen, text);
    if (!move) { setError("Enter one legal move, such as Nf3 or e2e4."); return; }
    setError(""); setText(""); onMove(move);
  }}>
    <label htmlFor={id}>Play a move with your keyboard</label>
    <div className={styles.moveEntryRow}>
      <input id={id} className="field" data-testid="move-notation" placeholder="Move notation, e.g. Nf3" autoComplete="off" autoCapitalize="off" spellCheck={false}
        value={text} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setText(event.target.value); setError(""); }} />
      <button className="btn" type="submit" disabled={disabled || !text.trim()}>Play move</button>
    </div>
    {error && <p id={`${id}-error`} className={styles.inputError} role="alert">{error}</p>}
  </form>;
}

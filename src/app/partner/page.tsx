"use client";
import { useEffect, useMemo, useState } from "react";
import { Chess, validateFen } from "chess.js";
import Board from "@/components/Board";
import { useApp } from "@/lib/store";
import { bookTitle } from "@/lib/books";
import { formatSolution, type MoveInput } from "@/lib/puzzle";
import { replayLine } from "@/lib/diagnostics";
import { decodeSession, encodeSession, type PartnerNotes, type PartnerSession } from "@/lib/share";
import { isTrainable } from "@/lib/validate";

const empty: PartnerNotes = { name: "", lines: "", evaluation: "", answer: "" };

function NotesView({ title, n, fen }: { title: string; n: PartnerNotes; fen: string }) {
  const lines = n.lines.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="card p-4"><div className="label">{title}</div>
      <div className="mt-2 text-sm"><span className="text-mute">Answer:</span> <span className="font-mono">{n.answer || "—"}</span> <span className="ml-3 text-mute">Verdict:</span> {n.evaluation || "—"}</div>
      <ul className="mt-2 flex flex-col gap-1">{lines.map((l, i) => { const r = replayLine(fen, l); return (
        <li key={i} className="font-mono text-sm">{l}{r.illegal && <span className="ml-2 rounded bg-bad/15 px-1.5 text-xs text-bad">illegal at {r.illegal}</span>}</li>); })}
        {!lines.length && <li className="text-sm text-mute">No lines written.</li>}</ul>
    </div>);
}

export default function PartnerPage() {
  const { ready, exercises } = useApp();
  const [session, setSession] = useState<PartnerSession | null>(null);
  const [theirs, setTheirs] = useState<PartnerNotes | null>(null);
  const [mine, setMine] = useState<PartnerNotes>(empty);
  const [committed, setCommitted] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [showBook, setShowBook] = useState(false);
  const [err, setErr] = useState("");

  const open = (s: PartnerSession) => { setSession({ ...s, notes: undefined }); if (s.notes) setTheirs(s.notes); setAnalysis(s.fen); setErr(""); };
  useEffect(() => {
    const m = window.location.hash.match(/s=([\w-]+)/);
    if (m) { const s = decodeSession(m[1]); if (s) open(s); else setErr("That partner link could not be read."); }
  }, []);
  useEffect(() => {
    if (!ready || session) return;
    const id = new URLSearchParams(window.location.search).get("id");
    const ex = id ? exercises.find((e) => e.id === id) : undefined;
    if (ex) open({ v: 1, fen: ex.fen, label: `${bookTitle(ex.bookId)} № ${ex.number}`, exerciseId: ex.id });
  }, [ready, exercises, session]);

  const ex = useMemo(() => exercises.find((e) => e.id === session?.exerciseId && e.fen === session?.fen && isTrainable(e)), [exercises, session]);
  const link = (withNotes: boolean) => `${window.location.origin}/partner#s=${encodeSession({ ...session!, notes: withNotes ? mine : undefined })}`;
  const copy = async (what: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(""); window.prompt("Copy this link", text); } };
  const move = (m: MoveInput) => { const c = new Chess(analysis!); try { c.move(m); setAnalysis(c.fen()); } catch { /* ignore */ } };

  if (!session) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Partner mode</h1>
        <p className="text-sm text-mute">Study one position with a training partner: each of you writes lines privately, then you swap links and compare. The position travels inside the link — nothing is stored on a server.</p>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="card flex flex-col gap-3 p-4"><div className="label">Open a link or code from your partner</div>
          <input className="field" placeholder="Paste partner link" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { const s = decodeSession(paste); if (s) open(s); else setErr("That partner link could not be read."); }}>Open</button></div>
        <div className="card flex flex-col gap-3 p-4"><div className="label">Or start from a position (FEN)</div>
          <input className="field font-mono" placeholder="FEN" value={fenInput} onChange={(e) => setFenInput(e.target.value)} />
          <button className="btn" onClick={() => (validateFen(fenInput.trim()).ok ? open({ v: 1, fen: fenInput.trim(), label: "Custom position" }) : setErr("That FEN is not a legal position."))}>Start session</button>
          <p className="text-xs text-mute">From training, use “Discuss” after an exercise to start a session on it.</p></div>
      </div>);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="mx-auto w-full max-w-[min(74vh,640px)]">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{session.label} · {session.fen.split(" ")[1] === "w" ? "White" : "Black"} to move</span>
          <button className="chip" onClick={() => setAnalysis(session.fen)}>Reset board</button></div>
        <Board fen={analysis ?? session.fen} orientation={session.fen.split(" ")[1] === "w" ? "white" : "black"} interactive={committed} onMove={move} />
        <p className="mt-2 text-xs text-mute">{committed ? "Board unlocked for discussion — play through either side's lines." : "Board locked until you commit your own analysis."}</p>
      </div>
      <aside className="flex flex-col gap-3">
        {!committed ? (
          <div className="card flex flex-col gap-3 p-4"><div className="label">Your analysis</div>
            <input className="field" placeholder="Your name" value={mine.name} onChange={(e) => setMine({ ...mine, name: e.target.value })} />
            <textarea className="field h-28 font-mono" data-testid="partner-lines" placeholder="One variation per line" value={mine.lines} onChange={(e) => setMine({ ...mine, lines: e.target.value })} />
            <div className="flex gap-2"><input className="field font-mono" placeholder="Final answer" value={mine.answer} onChange={(e) => setMine({ ...mine, answer: e.target.value })} />
              <input className="field" placeholder="Verdict (e.g. winning)" value={mine.evaluation} onChange={(e) => setMine({ ...mine, evaluation: e.target.value })} /></div>
            <button className="btn btn-primary" data-testid="partner-commit" onClick={() => setCommitted(true)}>Commit — then compare</button>
            <button className="btn" onClick={() => copy("invite", link(false))}>{copied === "invite" ? "Invite link copied" : "Copy invite link (position only)"}</button>
          </div>
        ) : (<>
          <NotesView title={`${mine.name || "You"}`} n={mine} fen={session.fen} />
          <button className="btn" data-testid="partner-share" onClick={() => copy("answer", link(true))}>{copied === "answer" ? "Link with your analysis copied" : "Copy link with your analysis"}</button>
          {theirs ? <NotesView title={theirs.name || "Partner"} n={theirs} fen={session.fen} /> : (
            <div className="card flex flex-col gap-2 p-4"><div className="label">Partner&apos;s analysis</div>
              <input className="field" placeholder="Paste the link your partner sends back" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button className="btn" onClick={() => { const s = decodeSession(paste); if (s?.notes && s.fen === session.fen) setTheirs(s.notes); else setErr("No analysis for this position in that link."); }}>Show partner&apos;s lines</button>
              {err && <p className="text-xs text-bad">{err}</p>}</div>)}
          {theirs && mine.answer && theirs.answer && (
            <p className={`rounded-xl border px-4 py-3 text-sm ${mine.answer.replace(/[+#!?]/g, "") === theirs.answer.replace(/[+#!?]/g, "") ? "border-good/40 bg-good/10 text-good" : "border-warn/40 bg-warn/10 text-warn"}`}>
              {mine.answer.replace(/[+#!?]/g, "") === theirs.answer.replace(/[+#!?]/g, "") ? "You chose the same first move. Compare how each of you handled the defences." : "You chose different first moves. Argue it out on the board before looking at the solution."}</p>)}
          {ex ? (showBook
            ? <div className="card p-4"><div className="label">Book solution</div><p className="mt-1 font-mono text-sm">{formatSolution(ex.fen, ex.solution)}</p></div>
            : <button className="btn" onClick={() => setShowBook(true)}>Reveal book solution</button>)
            : <p className="text-xs text-mute">The book solution appears here if this exercise is in your own library.</p>}
        </>)}
      </aside>
    </div>
  );
}

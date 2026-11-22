"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { del, get, set } from "idb-keyval";
import Board from "@/components/Board";
import type { MoveInput } from "@/lib/puzzle";
import { coverage, graphFromLines, judge, pickReply, posKey, record, START_FEN, type DrillProgress, type Edge, type Repertoire, type Side } from "@/lib/openings/graph";
import { groupsOf, yunkerRepertoire } from "@/lib/openings/yunker";
import { repertoireFromPgn } from "@/lib/openings/pgn";

const PROGRESS_KEY = "cst.openings.v1";
const IMPORT_KEY = "cst.openings.imported";
type Tone = "good" | "bad" | "info";
interface Game { fen: string; key: string; last: [string, string] | null; sans: string[]; misses: number; shown: boolean; clean: number; total: number; lines: string[] }
const newGame = (): Game => ({ fen: START_FEN, key: posKey(START_FEN), last: null, sans: [], misses: 0, shown: false, clean: 0, total: 0, lines: [] });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const movesText = (sans: string[]) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(" ");

export default function Openings() {
  const builtin = useMemo(() => yunkerRepertoire(), []);
  const [imported, setImported] = useState<Repertoire | null>(null);
  const [useImported, setUseImported] = useState(false);
  const [side, setSide] = useState<Side>("white");
  const [groups, setGroups] = useState<string[]>([]);
  const [progress, setProgress] = useState<DrillProgress>({});
  const [loaded, setLoaded] = useState(false);
  const [game, setGame] = useState<Game>(newGame);
  const [feedback, setFeedback] = useState<{ tone: Tone; text: string } | null>(null);
  const [marks, setMarks] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);
  // import form
  const [pgn, setPgn] = useState("");
  const [player, setPlayer] = useState("Yunker");
  const [depth, setDepth] = useState(12);
  const [importMsg, setImportMsg] = useState<{ tone: Tone; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      let p: DrillProgress = {};
      try { p = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}") as DrillProgress; } catch { /* start fresh */ }
      let rep: Repertoire | null = null;
      try { rep = (await get<Repertoire>(IMPORT_KEY)) ?? null; } catch { /* no saved import */ }
      if (!live) return;
      setProgress(p); setImported(rep); setUseImported(!!rep); setLoaded(true);
    })();
    return () => { live = false; };
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* storage full: progress stays for this visit */ } } }, [progress, loaded]);

  const rep = useImported && imported ? imported : builtin;
  const graph = useMemo(() => (rep.lines ? graphFromLines(rep.lines, side, new Set(groups)) : rep[side]), [rep, side, groups]);
  const node = graph.nodes[game.key];
  const empty = !graph.nodes[graph.root]?.edges.length;
  const over = !empty && (!node || !node.edges.length);
  const myTurn = !!node && node.mine && node.edges.length > 0;
  const cover = useMemo(() => coverage(graph, progress), [graph, progress]);

  const restart = useCallback(() => { setGame(newGame()); setFeedback(null); setMarks([]); setResetKey((k) => k + 1); }, []);
  const choose = (fn: () => void) => { fn(); restart(); };

  const play = useCallback((g: Game, e: Edge, mine: boolean, first: boolean): Game => {
    const c = new Chess(g.fen);
    c.move({ from: e.uci.slice(0, 2), to: e.uci.slice(2, 4), promotion: e.uci[4] });
    return { fen: c.fen(), key: posKey(c.fen()), last: [e.uci.slice(0, 2), e.uci.slice(2, 4)], sans: [...g.sans, e.san], misses: 0, shown: false,
      clean: g.clean + (mine && first ? 1 : 0), total: g.total + (mine ? 1 : 0), lines: e.lines.length ? e.lines : g.lines };
  }, []);

  // the opponent answers from the repertoire's own lines or games
  useEffect(() => {
    if (!node || node.mine || !node.edges.length) return;
    const t = window.setTimeout(() => {
      const e = pickReply(graph, game.key, progress, Math.random());
      if (e) setGame((g) => (g.key === game.key ? play(g, e, false, false) : g));
    }, 450);
    return () => window.clearTimeout(t);
  }, [node, graph, game.key, progress, play]);

  const onMove = (m: MoveInput) => {
    if (!myTurn) return;
    const v = judge(graph, game.key, m);
    const first = game.misses === 0 && !game.shown;
    if (v.ok && v.edge) {
      if (first) setProgress((p) => record(p, side, game.key, true, Date.now()));
      const isMain = v.edge === v.main, alone = node.edges.length === 1;
      setFeedback({ tone: "good", text: alone ? `${v.edge.san} — the repertoire move.` : isMain ? `${v.edge.san} — the main choice here (${pct(v.share)}).` : `${v.edge.san} — also played here (${pct(v.share)}); the main choice is ${v.main?.san}.` });
      setMarks([]);
      setGame((g) => play(g, v.edge!, true, first));
      return;
    }
    let san = `${m.from}–${m.to}`;
    try { san = new Chess(game.fen).move({ from: m.from, to: m.to, promotion: m.promotion }).san; } catch { /* keep squares */ }
    if (first) setProgress((p) => record(p, side, game.key, false, Date.now()));
    const misses = game.misses + 1;
    setGame((g) => ({ ...g, misses }));
    setFeedback({ tone: "bad", text: `${san} is not in this repertoire. Take it back and try again${misses >= 2 ? " — the piece to move is marked" : ""}.` });
    setMarks(misses >= 2 && v.main ? [v.main.uci.slice(0, 2)] : []);
    setResetKey((k) => k + 1);
  };

  const hint = () => { if (myTurn) { setMarks([node.edges[0].uci.slice(0, 2)]); setGame((g) => ({ ...g, misses: Math.max(g.misses, 1) })); if (game.misses === 0 && !game.shown) setProgress((p) => record(p, side, game.key, false, Date.now())); } };
  const show = () => {
    if (!myTurn) return;
    const e = node.edges[0];
    if (game.misses === 0 && !game.shown) setProgress((p) => record(p, side, game.key, false, Date.now()));
    setGame((g) => ({ ...g, shown: true }));
    setMarks([e.uci.slice(0, 2), e.uci.slice(2, 4)]);
    setFeedback({ tone: "info", text: `The move is ${e.san}${node.edges.length > 1 ? ` (also: ${node.edges.slice(1).map((x) => x.san).join(", ")})` : ""}. Play it on the board.` });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "r" || (over && (e.key === "Enter" || e.key === " "))) { e.preventDefault(); restart(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [over, restart]);

  const build = async () => {
    setImportMsg(null);
    if (!pgn.trim()) { setImportMsg({ tone: "bad", text: "Paste a PGN or choose a .pgn file first." }); return; }
    if (!player.trim()) { setImportMsg({ tone: "bad", text: "Enter the player's name as it appears in the PGN." }); return; }
    const r = repertoireFromPgn(pgn, player, depth * 2);
    if (!r.used) {
      setImportMsg({ tone: "bad", text: `No game out of ${r.total} has a player matching "${player}".${r.otherPlayers.length ? ` Names in the file include: ${r.otherPlayers.join("; ")}.` : ""}` });
      return;
    }
    try { await set(IMPORT_KEY, r.repertoire); } catch { /* still usable for this visit */ }
    setImported(r.repertoire); setUseImported(true); setPgn(""); restart();
    setImportMsg({ tone: "good", text: `Built from ${r.used} of ${r.total} games: ${r.asWhite} as White, ${r.asBlack} as Black${r.unreadable ? `; ${r.unreadable} could not be read` : ""}.` });
  };
  const removeImport = async () => { try { await del(IMPORT_KEY); } catch { /* nothing stored */ } setImported(null); setUseImported(false); setImportMsg(null); restart(); };
  const onFile = async (f: File | undefined) => { if (f) setPgn(await f.text()); };

  const tone = (t: Tone) => (t === "good" ? "text-good" : t === "bad" ? "text-bad" : "text-mute");
  const sideGroups = rep.lines ? groupsOf(side) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repertoire drill</h1>
        <p className="text-sm text-mute">Play the repertoire&apos;s moves from memory. The opponent answers from the same lines; a wrong move is taken back so you can try again.</p>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1">Repertoire</span>
          <button className="chip" data-on={rep === builtin} data-testid="rep-builtin" onClick={() => choose(() => setUseImported(false))}>{builtin.name}</button>
          {imported && <button className="chip" data-on={rep === imported} data-testid="rep-imported" onClick={() => choose(() => setUseImported(true))}>{imported.name}</button>}
        </div>
        <p className="text-xs text-mute" data-testid="rep-note">{rep.note}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1">Play as</span>
          {(["white", "black"] as Side[]).map((s) => <button key={s} className="chip" data-on={side === s} data-testid={`side-${s}`} onClick={() => choose(() => { setSide(s); setGroups([]); })}>{s === "white" ? "White" : "Black"}</button>)}
        </div>
        {sideGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="label mr-1">Openings</span>
            <button className="chip" data-on={!groups.length} onClick={() => choose(() => setGroups([]))}>All</button>
            {sideGroups.map((g) => <button key={g} className="chip" data-on={groups.includes(g)} data-testid={`group-${g}`} onClick={() => choose(() => setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g]))}>{g}</button>)}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Board fen={game.fen} orientation={side} interactive={myTurn} onMove={onMove} lastMove={game.last} highlights={marks} resetKey={resetKey} />
        <div className="flex flex-col gap-3">
          <div className="card flex flex-col gap-3 p-4" data-testid="drill" data-over={over} data-turn={myTurn ? "you" : over ? "over" : "opponent"}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">{game.lines.length ? game.lines.slice(0, 2).join(" · ") : "From the first move"}</span>
              <span className="shrink-0 text-xs tabular-nums text-mute" data-testid="score">{game.clean}/{game.total} first try</span>
            </div>
            <p className="min-h-10 font-mono text-sm leading-relaxed" data-testid="moves">{game.sans.length ? movesText(game.sans) : "—"}</p>
            {empty ? <p className="text-sm text-warn">This repertoire has no games as {side === "white" ? "White" : "Black"}.</p>
              : over ? <p className="text-sm font-semibold text-good" data-testid="line-done">End of the prepared line — {game.clean} of {game.total} moves right first time.</p>
              : <p className="text-sm text-mute">{myTurn ? `Your move as ${side === "white" ? "White" : "Black"}.` : "Opponent is moving…"}</p>}
            {feedback && <p className={`text-sm ${tone(feedback.tone)}`} data-testid="feedback" data-tone={feedback.tone}>{feedback.text}</p>}
            <div className="flex flex-wrap gap-2">
              {over ? <button className="btn btn-primary flex-1" data-testid="next-line" onClick={restart} autoFocus>Next line →</button>
                : <><button className="btn flex-1" data-testid="hint" onClick={hint} disabled={!myTurn}>Hint</button>
                  <button className="btn flex-1" data-testid="show" onClick={show} disabled={!myTurn}>Show move</button></>}
              <button className="btn btn-ghost" data-testid="restart" onClick={restart}>Restart</button>
            </div>
            <p className="text-[11px] text-mute">r restarts from move one{over ? " · Enter for the next line" : ""}.</p>
          </div>

          <div className="card p-4" data-testid="coverage">
            <div className="flex items-baseline justify-between"><span className="label">Positions learned</span><span className="text-sm tabular-nums">{cover.learned}/{cover.total}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-accent" style={{ width: `${cover.total ? (cover.learned / cover.total) * 100 : 0}%` }} /></div>
            <p className="mt-2 text-xs text-mute">{cover.seen} of {cover.total} positions seen. A position counts as learned after 3 first-try answers in a row; lines you know less come up more often.</p>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <div><div className="font-medium">Train on a player&apos;s real games</div>
          <p className="text-sm text-mute">Load a PGN of their games and the trainer drills the moves they actually played, weighted by how often. The file stays in this browser.</p></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="flex flex-col gap-1 text-xs text-mute">Player name in the PGN<input className="field" data-testid="pgn-player" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Yunker" /></label>
          <label className="flex flex-col gap-1 text-xs text-mute">Depth<select className="field w-auto" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>{[8, 10, 12, 15, 20].map((d) => <option key={d} value={d}>{d} moves</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs text-mute">PGN file<input className="field" type="file" accept=".pgn,text/plain" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        </div>
        <textarea className="field h-28 font-mono text-xs" data-testid="pgn-text" value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="…or paste PGN here" />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" data-testid="pgn-build" onClick={build}>Build repertoire</button>
          {imported && <button className="btn btn-ghost" data-testid="pgn-remove" onClick={removeImport}>Remove imported repertoire</button>}
          {importMsg && <span className={`text-sm ${tone(importMsg.tone)}`} data-testid="pgn-msg">{importMsg.text}</span>}
        </div>
      </div>
    </div>
  );
}

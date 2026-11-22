"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { del, get, set } from "idb-keyval";
import Board from "@/components/Board";
import type { MoveInput } from "@/lib/puzzle";
import { coverage, graphFromLines, judge, pickReply, posKey, record, START_FEN, type DrillProgress, type Edge, type Repertoire, type Side } from "@/lib/openings/graph";
import { gameLabel, selectGames, STUDY_DAYS, VERIFIED_GAMES, verifiedRepertoire, type GamePool } from "@/lib/openings/verified";
import { repertoireFromPgn } from "@/lib/openings/pgn";

const PROGRESS_KEY = "cst.openings.verified.v1";
const IMPORT_KEY = "cst.openings.imported";
type Tone = "good" | "bad" | "info";
interface Game { fen: string; key: string; last: [string, string] | null; sans: string[]; misses: number; shown: boolean; clean: number; total: number; lines: string[] }
const newGame = (): Game => ({ fen: START_FEN, key: posKey(START_FEN), last: null, sans: [], misses: 0, shown: false, clean: 0, total: 0, lines: [] });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const movesText = (sans: string[]) => sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(" ");

export default function Openings() {
  const [pool, setPool] = useState<GamePool>("tournament");
  const [since, setSince] = useState("2025-01-01");
  const [trainingDepth, setTrainingDepth] = useState(12);
  const [mode, setMode] = useState<"learn" | "recall">("learn");
  const [variation, setVariation] = useState("");
  const builtin = useMemo(() => verifiedRepertoire(pool, since, trainingDepth), [pool, since, trainingDepth]);
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
  const selectedGames = useMemo(() => selectGames(pool, since, side).filter(g => !groups.length || groups.includes(g.group)), [pool, since, side, groups]);
  const activeGames = useMemo(() => selectedGames.filter(g => !variation || g.opening === variation), [selectedGames, variation]);
  const graph = useMemo(() => (rep.lines ? graphFromLines(rep.lines.filter(l => !variation || activeGames.some(g => g.id === l.id)), side, new Set(groups)) : rep[side]), [rep, side, groups, variation, activeGames]);
  const node = graph.nodes[game.key];
  const empty = !graph.nodes[graph.root]?.edges.length;
  const over = !empty && (!node || !node.edges.length || game.sans.length >= (rep === builtin ? trainingDepth * 2 : 80));
  const myTurn = !over && !!node && node.mine && node.edges.length > 0;
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
    if (!node || node.mine || !node.edges.length || over || mode === "learn") return;
    const t = window.setTimeout(() => {
      const e = pickReply(graph, game.key, progress, Math.random());
      if (e) setGame((g) => (g.key === game.key ? play(g, e, false, false) : g));
    }, 450);
    return () => window.clearTimeout(t);
  }, [node, graph, game.key, progress, play, mode, over]);

  const onMove = (m: MoveInput) => {
    if (!myTurn) return;
    const v = judge(graph, game.key, m);
    const first = mode === "recall" && game.misses === 0 && !game.shown;
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
    setFeedback({ tone: "bad", text: `${san} is not recorded in this selection. That does not make it a bad chess move. Try a recorded choice${misses >= 2 ? " — the piece to move is marked" : ""}.` });
    setMarks(misses >= 2 && v.main ? [v.main.uci.slice(0, 2)] : []);
    setResetKey((k) => k + 1);
  };

  const hint = () => { if (myTurn) { setMarks([node.edges[0].uci.slice(0, 2)]); setGame((g) => ({ ...g, misses: Math.max(g.misses, 1) })); if (mode === "recall" && game.misses === 0 && !game.shown) setProgress((p) => record(p, side, game.key, false, Date.now())); } };
  const show = () => {
    if (!myTurn) return;
    const e = node.edges[0];
    if (mode === "recall" && game.misses === 0 && !game.shown) setProgress((p) => record(p, side, game.key, false, Date.now()));
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
    setImported(r.repertoire); setUseImported(true); setGroups([]); setVariation(""); setTrainingDepth(depth); setPgn(""); restart();
    setImportMsg({ tone: "good", text: `Built from ${r.used} of ${r.total} games: ${r.asWhite} as White, ${r.asBlack} as Black${r.unreadable ? `; ${r.unreadable} could not be read` : ""}.` });
  };
  const removeImport = async () => { try { await del(IMPORT_KEY); } catch { /* nothing stored */ } setImported(null); setUseImported(false); setImportMsg(null); restart(); };
  const onFile = async (f: File | undefined) => { if (f) setPgn(await f.text()); };

  const tone = (t: Tone) => (t === "good" ? "text-good" : t === "bad" ? "text-bad" : "text-mute");
  const sideGroups = rep.lines ? [...new Set(rep.lines.filter(l => l.side === side).map(l => l.group))].sort((a,b) => rep.lines!.filter(l=>l.side===side&&l.group===b).length-rep.lines!.filter(l=>l.side===side&&l.group===a).length) : [];
  const variations = [...new Set(selectedGames.map(g=>g.opening))].sort();
  const witnesses = rep === builtin ? activeGames.filter(g => game.lines.includes(g.id)).slice(0,5) : [];
  const distinctLines = new Set(activeGames.map(g=>g.moves.slice(0,trainingDepth*2).join(" "))).size;
  const chooseMove = (e: Edge) => {
    if (myTurn) onMove({from:e.uci.slice(0,2),to:e.uci.slice(2,4),promotion:e.uci[4]});
    else { setGame(g=>play(g,e,false,false)); setFeedback(null); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Train Alisa’s actual openings</h1>
        <p className="text-sm text-mute">Explore the recorded alternatives, then play them from memory. Choose tournament games first; add online games for wider coverage.</p>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-medium">Your five-day preparation plan</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{STUDY_DAYS.map((day,i)=><div key={day.title}><h2 className="font-medium">{day.title}</h2><p className="my-2 text-sm text-mute">{day.task}</p><button className="btn" onClick={()=>choose(()=>{setUseImported(false);setPool("rapid-blitz");setSince("2025-01-01");setSide(day.side);setGroups(day.groups);setVariation("");setTrainingDepth(i===0?8:12);setMode(i===4?"recall":"learn");})}>Train day {i+1}</button></div>)}</div>
        <p className="mt-4 text-xs text-mute">Suggested coaching prompts, not quotations or a claim about her intentions. Practice both colors on the final day.</p>
      </details>

      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1">Repertoire</span>
          <button className="chip" data-on={rep === builtin} data-testid="rep-builtin" onClick={() => choose(() => {setUseImported(false);setGroups([]);setVariation("");})}>{builtin.name}</button>
          {imported && <button className="chip" data-on={rep === imported} data-testid="rep-imported" onClick={() => choose(() => {setUseImported(true);setGroups([]);setVariation("");})}>{imported.name}</button>}
        </div>
        <p className="text-xs text-mute" data-testid="rep-note">{rep.note}</p>
        {rep === builtin && <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-mute">Games<select className="field mt-1 w-full" aria-label="Game sources" value={pool} onChange={e=>choose(()=>{setPool(e.target.value as GamePool);setGroups([]);setVariation("");})}><option value="tournament">Tournament broadcasts</option><option value="rapid-blitz">Tournament + online rapid/blitz</option><option value="all">All, including bullet and daily</option></select></label>
          <label className="text-xs text-mute">Period<select className="field mt-1 w-full" aria-label="Game period" value={since} onChange={e=>choose(()=>{setSince(e.target.value);setGroups([]);setVariation("");})}><option value="2025-01-01">2025–2026</option><option value="2026-01-01">2026 only</option><option value="">All available years</option></select></label>
          <label className="text-xs text-mute">Train through<select className="field mt-1 w-full" aria-label="Training depth" value={trainingDepth} onChange={e=>choose(()=>setTrainingDepth(Number(e.target.value)))}>{[8,12,15,20].map(d=><option key={d} value={d}>Move {d}</option>)}</select></label>
        </div>}
        <div className="flex flex-wrap gap-2">{(["learn","recall"] as const).map(m=><button key={m} className="chip" data-on={mode===m} onClick={()=>choose(()=>setMode(m))}>{m==="learn"?"Learn & explore":"Recall without hints"}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mr-1">Play as</span>
          {(["white", "black"] as Side[]).map((s) => <button key={s} className="chip" data-on={side === s} data-testid={`side-${s}`} onClick={() => choose(() => { setSide(s); setGroups([]);setVariation(""); })}>{s === "white" ? "White" : "Black"}</button>)}
        </div>
        {sideGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="label mr-1">Openings</span>
            <button className="chip" data-on={!groups.length} onClick={() => choose(() => {setGroups([]);setVariation("");})}>All</button>
            {sideGroups.map((g) => <button key={g} className="chip" data-on={groups.includes(g)} data-testid={`group-${g}`} onClick={() => choose(() => {setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g]);setVariation("");})}>{g} ({rep.lines!.filter(l=>l.side===side&&l.group===g).length})</button>)}
          </div>
        )}
        {rep===builtin && <><label className="text-xs text-mute">Specific variation<select className="field mt-1 w-full" aria-label="Specific variation" value={variation} onChange={e=>choose(()=>setVariation(e.target.value))}><option value="">All recorded variations in selected openings</option>{variations.map(v=><option key={v} value={v}>{v} ({selectedGames.filter(g=>g.opening===v).length})</option>)}</select></label><p className="text-xs text-mute" data-testid="sample-coverage">{activeGames.length} games as {side}; {distinctLines} distinct sequences through move {trainingDepth} or the recorded end. Unrecorded responses remain gaps.</p></>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Board fen={game.fen} orientation={side} interactive={myTurn} onMove={onMove} lastMove={game.last} highlights={marks} resetKey={resetKey} />
        <div className="flex flex-col gap-3">
          <div className="card flex flex-col gap-3 p-4" data-testid="drill" data-over={over} data-turn={myTurn ? "you" : over ? "over" : "opponent"}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">{game.lines.length ? game.lines.slice(0, 2).map(id=>{const g=VERIFIED_GAMES.find(g=>g.id===id);return g?gameLabel(g):id;}).join(" · ") : "From the first move"}</span>
              <span className="shrink-0 text-xs tabular-nums text-mute" data-testid="score">{mode==="recall"?`${game.clean}/${game.total} first try`:`${game.sans.length} half-moves explored`}</span>
            </div>
            <p className="min-h-10 font-mono text-sm leading-relaxed" data-testid="moves">{game.sans.length ? movesText(game.sans) : "—"}</p>
            {empty ? <p className="text-sm text-warn">This repertoire has no games as {side === "white" ? "White" : "Black"}.</p>
              : over ? <p className="text-sm font-semibold text-good" data-testid="line-done">End of this recorded line{mode==="recall" ? ` — ${game.clean} of ${game.total} moves right first time.` : ". Switch to recall when ready."}</p>
              : <p className="text-sm text-mute">{myTurn ? `Your move as ${side === "white" ? "White" : "Black"}.` : mode==="learn" ? "Choose an opponent reply below." : "Opponent is moving…"}</p>}
            {mode==="learn" && !over && !!node?.edges.length && <div role="group" className="flex flex-wrap gap-2" aria-label="Recorded moves">{node.edges.map(e=><button key={e.uci} className="btn" onClick={()=>chooseMove(e)}>{e.san} · {e.count} {e.count===1?"game":"games"}</button>)}</div>}
            {feedback && <p className={`text-sm ${tone(feedback.tone)}`} data-testid="feedback" data-tone={feedback.tone}>{feedback.text}</p>}
            <div className="flex flex-wrap gap-2">
              {over ? <button className="btn btn-primary flex-1" data-testid="next-line" onClick={restart} autoFocus>Next line →</button>
                : <><button className="btn flex-1" data-testid="hint" onClick={hint} disabled={!myTurn}>Hint</button>
                  <button className="btn flex-1" data-testid="show" onClick={show} disabled={!myTurn}>Show move</button></>}
              <button className="btn btn-ghost" data-testid="restart" onClick={restart}>Restart</button>
            </div>
            <p className="text-[11px] text-mute">r restarts from move one{over ? " · Enter for the next line" : ""}.</p>
          </div>

          {witnesses.length>0 && <div className="card p-4"><h2 className="label">Source games for the last move</h2><ul className="mt-2 space-y-2">{witnesses.map(g=><li key={g.id} className="text-xs"><a href={g.url} target="_blank" rel="noreferrer" className="underline">{g.white} – {g.black}</a><br/>{g.date} · {g.source==="online"?"Online":"Tournament"} · {g.timeClass==="unspecified"?"time class unspecified":g.timeClass} · {g.result}<br/><span className="text-mute">{g.opening}</span></li>)}</ul><p className="mt-2 text-xs text-mute">Moves may transpose between games. These sources contain the last move, not necessarily the entire route you took.</p></div>}

          <div className="card p-4" data-testid="coverage">
            <div className="flex items-baseline justify-between"><span className="label">Positions learned</span><span className="text-sm tabular-nums">{cover.learned}/{cover.total}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2"><div className="h-full bg-accent" style={{ width: `${cover.total ? (cover.learned / cover.total) * 100 : 0}%` }} /></div>
            <p className="mt-2 text-xs text-mute">{cover.seen} of {cover.total} positions seen. A position counts as learned after 3 first-try answers in a row; lines you know less come up more often.</p>
          </div>
        </div>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-medium">Coverage, sources and downloadable games</summary>
        <p className="mt-3 text-sm text-mute">{VERIFIED_GAMES.length} verified game records: {VERIFIED_GAMES.filter(g=>g.source==="tournament").length} tournament broadcasts and {VERIFIED_GAMES.filter(g=>g.source==="online").length} online games. Checked November 22, 2026. The tree includes the first 20 moves at most; shorter games stop at their recorded end. This is the available sample, not every game or variation she has ever played.</p>
        <p className="mt-3 text-sm"><a className="underline" href="/openings/yunker-verified-games.pgn" download>Download the full source games (PGN)</a></p>
        <p className="mt-3 text-sm text-mute">Public moves from <a className="underline" href="https://www.chess.com/member/yunker_alisa" target="_blank" rel="noreferrer">her Chess.com account</a> and linked Lichess broadcasts. Chess Quest is not affiliated with Chess.com or endorsed by Alisa Yunker.</p>
        <p className="mt-3 text-sm text-mute"><a className="underline" href="https://www.youtube.com/@yunkerchessbyarke" target="_blank" rel="noreferrer">The Yunkers’ Chess &amp; Co channel</a> is a further study source. Video titles alone were not used to invent moves; untranscribed videos are not included in the verified counts.</p>
      </details>

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

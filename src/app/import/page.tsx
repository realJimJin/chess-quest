"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { exerciseErrors, validateDb, type ImportResult } from "@/lib/validate";
import { formatSolution, parseSolutionText } from "@/lib/puzzle";
import type { Exercise, ExerciseDb, PieceCluster } from "@/lib/types";
import { SAMPLE_PACK } from "@/lib/samples";

const PIECES = ["K", "Q", "R", "B", "N", "P", "k", "q", "r", "b", "n", "p"];
const GLYPH: Record<string, string> = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

const expand = (placement: string): string[] => placement.split("/").flatMap((row) => [...row].flatMap((c) => (/\d/.test(c) ? Array(Number(c)).fill("") : [c])));
const collapse = (cells: string[]): string => Array.from({ length: 8 }, (_, r) => cells.slice(r * 8, r * 8 + 8).join(",").split(",").reduce((acc, c) => (c ? acc + c : /\d$/.test(acc) ? acc.slice(0, -1) + (Number(acc.slice(-1)) + 1) : acc + "1"), "")).join("/");

function Editor({ ex, onSave }: { ex: Exercise; onSave: (e: Exercise) => void }) {
  const parts = ex.fen.split(" ");
  const [cells, setCells] = useState<string[]>(() => { const c = expand(parts[0]); return c.length === 64 ? c : Array(64).fill(""); });
  const [turn, setTurn] = useState(parts[1] === "b" ? "b" : "w");
  const [castle, setCastle] = useState(parts[2] ?? "-");
  const [brush, setBrush] = useState("");
  const [text, setText] = useState(ex.solution.length ? formatSolution(ex.fen, ex.solution) : ex.solutionRaw);
  const fen = `${collapse(cells)} ${turn} ${castle || "-"} - 0 1`;
  let solution: Exercise["solution"] = [], solErr = "";
  try { if (text.trim()) solution = parseSolutionText(fen, text); else solErr = "Enter the book's solution."; } catch (e) { solErr = (e as Error).message; }
  const candidate: Exercise = { ...ex, fen, sideToMove: turn === "w" ? "white" : "black", instruction: `${turn === "w" ? "White" : "Black"} to move`, solution, solutionRaw: ex.solutionRaw || text };
  const errs = solErr ? [solErr] : exerciseErrors(candidate);
  return (
    <div className="grid gap-4 border-t border-line p-4 md:grid-cols-[200px_minmax(0,280px)_1fr]" data-testid={`editor-${ex.id}`}>
      <div>
        <div className="label mb-1">Scan (PDF p. {ex.pdfPage})</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ex.diagram ? <img src={ex.diagram} alt={`Diagram ${ex.number} from your PDF`} className="w-full rounded border border-line" /> : <p className="text-xs text-mute">No scan stored.</p>}
      </div>
      <div>
        <div className="label mb-1">Position — click a piece, then squares</div>
        <div className="grid grid-cols-8 overflow-hidden rounded border border-line">
          {cells.map((c, i) => (
            <button key={i} aria-label={`square ${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)}`} onClick={() => setCells(cells.map((x, j) => (j === i ? (x === brush ? "" : brush) : x)))}
              className={`aspect-square text-2xl leading-none ${(Math.floor(i / 8) + i) % 2 ? "bg-[#7d93a8]" : "bg-[#dfe4ea]"} text-black`}>{GLYPH[c] ?? ""}</button>))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {PIECES.map((p) => <button key={p} className={`btn h-8 w-8 p-0 text-lg ${brush === p ? "border-accent" : ""}`} onClick={() => setBrush(p)}>{GLYPH[p]}</button>)}
          <button className={`btn h-8 px-2 text-xs ${brush === "" ? "border-accent" : ""}`} onClick={() => setBrush("")}>erase</button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1 text-xs">{ex.verification.flags.map((f) => <span key={f} className="rounded bg-warn/15 px-1.5 py-0.5 text-warn">{f}</span>)}
          <span className="rounded bg-panel2 px-1.5 py-0.5 text-mute">diagram confidence {Math.round(ex.verification.fenConfidence * 100)}%</span></div>
        <div className="flex gap-2">
          <select className="field w-auto" value={turn} onChange={(e) => setTurn(e.target.value)}><option value="w">White to move</option><option value="b">Black to move</option></select>
          <input className="field w-28 font-mono" value={castle} onChange={(e) => setCastle(e.target.value)} title="Castling rights (KQkq or -)" />
        </div>
        <label className="block"><span className="label">Solution as printed in the book</span>
          <textarea className="field mt-1 h-20 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="1.Qxh7+ Kxh7 2.Rh3#" /></label>
        {ex.solutionRaw && <p className="text-xs text-mute">Extracted text: <span className="font-mono">{ex.solutionRaw}</span></p>}
        {errs.length ? <p className="text-xs text-bad">{errs.join("; ")}</p> : <p className="text-xs text-good">Position and every move are legal.</p>}
        <button className="btn btn-primary self-start" disabled={errs.length > 0} data-testid="approve"
          onClick={() => onSave({ ...candidate, verification: { ...ex.verification, status: "verified", fenLegal: true, solutionLegal: true, reviewedBy: "user", flags: [...ex.verification.flags.filter((f) => f !== "user_reviewed"), "user_reviewed"] } })}>
          I checked this against the book — approve</button>
      </div>
    </div>
  );
}

export default function ImportPage() {
  const { library, exercises, importBook, updateExercise, removeBook } = useApp();
  const [res, setRes] = useState<ImportResult | null>(null);
  const [msg, setMsg] = useState("");
  const [local, setLocal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<File | null>(null);
  const [opts, setOpts] = useState({ profile: "cs2a", pages: "", solutionsPages: "", pageOffset: "0", firstNumber: "1", lang: "fig", synthetic: false });
  const [clusters, setClusters] = useState<PieceCluster[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const ios = process.env.NEXT_PUBLIC_TARGET === "ios";
  useEffect(() => { if (process.env.NEXT_PUBLIC_TARGET === "ios") { setLocal(false); return; } fetch("/api/extract").then((r) => r.json()).then((j) => setLocal(Boolean(j.available))).catch(() => setLocal(false)); }, []);

  const take = (raw: unknown) => {
    const r = validateDb(raw);
    setRes(r); setMsg(r.error ?? "");
    setClusters(((raw as ExerciseDb)?.pieceClusters ?? []) as PieceCluster[]);
  };
  const onJson = async (f?: File) => { if (!f) return; try { take(JSON.parse(await f.text())); } catch { setRes(null); setMsg("That file is not valid JSON."); } };
  const extract = async (withLabels: boolean) => {
    if (!pdf) return;
    setBusy(true); setMsg("");
    const fd = new FormData();
    fd.set("pdf", pdf);
    Object.entries(opts).forEach(([k, v]) => fd.set(k, typeof v === "boolean" ? (v ? "1" : "") : v));
    if (withLabels) fd.set("labels", JSON.stringify(clusters.map(({ id, label, confirmed }) => ({ id, label, confirmed }))));
    try {
      const r = await fetch("/api/extract", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || j.error) { setRes(null); setMsg(j.message ?? j.error ?? "Extraction failed."); } else take(j);
    } catch { setMsg("Could not reach the local extractor."); }
    setBusy(false);
  };
  const save = async () => {
    if (!res?.db) return;
    await importBook(res.db.book, res.accepted, res.db.report);
    setMsg(`Added ${res.accepted.length} exercises to “${res.db.book.title}”.`); setRes(null);
  };
  const exportLib = () => {
    const blob = new Blob([JSON.stringify(library)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "chess-school-library-backup.json"; a.click(); URL.revokeObjectURL(a.href);
  };

  const report = res?.db?.report as Record<string, unknown> | undefined;
  const verified = res?.accepted.filter((e) => e.verification.status === "verified").length ?? 0;
  const pending = exercises.filter((e) => e.verification.status !== "verified");
  const unconfirmed = clusters.filter((c) => !c.confirmed && c.confidence < 0.6).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import your book</h1>
        {process.env.NEXT_PUBLIC_TARGET === "ios" ? <p className="mt-1 max-w-3xl text-sm text-mute">Chess Quest trains from exercise files you supply. They are stored on this device only and never uploaded.</p>
          : <p className="mt-1 max-w-3xl text-sm text-mute">The two public publisher PDFs for Chess School 2a and 2b are 7-page previews (cover, contents, foreword, symbol key) with no exercises, and no complete edition is openly available. Exercises therefore come only from a PDF you own. They are stored in this browser and never uploaded to the hosted site.</p>}
      </div>
      {msg && <p className="rounded-xl border border-line bg-panel2 px-4 py-3 text-sm" data-testid="import-msg">{msg}</p>}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col gap-3 p-5">
          <h2 className="font-semibold">1 · Extract from your PDF</h2>
          {ios && <p className="text-sm text-mute">Reading a PDF needs the desktop tool. Extract your book on a Mac, save the resulting <span className="font-mono">exercises.json</span> to Files or iCloud Drive, then load it below.</p>}
          {process.env.NEXT_PUBLIC_TARGET !== "ios" && local === false && (
            <div className="text-sm text-mute">
              <p>Extraction runs on your own computer so the book never leaves it. From the project folder:</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0f1216] p-3 font-mono text-xs text-ink">{`cd extraction
.venv/bin/python -m csx.cli ~/Books/chess-school-2a.pdf --profile cs2a --out out`}</pre>
              <p className="mt-2">Then load <span className="font-mono">out/exercises.json</span> on the right. Running the app locally (<span className="font-mono">npm run dev</span>) enables direct PDF upload here.</p>
            </div>)}
          {process.env.NEXT_PUBLIC_TARGET !== "ios" && local && (<>
            <input type="file" accept="application/pdf" className="field" data-testid="pdf-input" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label><span className="label">Book</span><select className="field mt-1" value={opts.profile} onChange={(e) => setOpts({ ...opts, profile: e.target.value })}>
                <option value="cs2a">Chess School 2a</option><option value="cs2b">Chess School 2b</option><option value="cs2">Chess School 2 (one volume)</option><option value="generic">Other</option></select></label>
              <label><span className="label">Solution notation</span><select className="field mt-1" value={opts.lang} onChange={(e) => setOpts({ ...opts, lang: e.target.value })}>
                <option value="fig">Figurines / English</option><option value="ru">Russian letters</option><option value="de">German letters</option><option value="es">Spanish letters</option></select></label>
              <label><span className="label">Exercise pages (PDF)</span><input className="field mt-1" placeholder="auto, or 7-108" value={opts.pages} onChange={(e) => setOpts({ ...opts, pages: e.target.value })} /></label>
              <label><span className="label">Solution pages (PDF)</span><input className="field mt-1" placeholder="auto, or 109-136" data-testid="sol-pages" value={opts.solutionsPages} onChange={(e) => setOpts({ ...opts, solutionsPages: e.target.value })} /></label>
              <label><span className="label">Printed − PDF page offset</span><input className="field mt-1" value={opts.pageOffset} onChange={(e) => setOpts({ ...opts, pageOffset: e.target.value })} /></label>
              <label><span className="label">First exercise number</span><input className="field mt-1" value={opts.firstNumber} onChange={(e) => setOpts({ ...opts, firstNumber: e.target.value })} /></label>
            </div>
            <label className="flex items-center gap-2 text-xs text-mute"><input type="checkbox" data-testid="synthetic" checked={opts.synthetic} onChange={(e) => setOpts({ ...opts, synthetic: e.target.checked })} /> This PDF is a test file, not the book (label its positions as test fixtures)</label>
            <button className="btn btn-primary" data-testid="extract" disabled={!pdf || busy} onClick={() => extract(false)}>{busy ? "Extracting…" : "Extract exercises"}</button>
          </>)}
        </div>
        <div className="card flex flex-col gap-3 p-5">
          <h2 className="font-semibold">2 · Or load an extracted database</h2>
          <p className="text-sm text-mute">Choose the <span className="font-mono">exercises.json</span> the pipeline wrote. Every position and move is re-checked before it is accepted.</p>
          <input type="file" accept="application/json,.json" className="field" data-testid="json-input" onChange={(e) => onJson(e.target.files?.[0])} />
          {!library.samples && <button className="btn self-start" onClick={async () => { await importBook(SAMPLE_PACK.book, SAMPLE_PACK.exercises); setMsg("Added the sample pack: eight original puzzles, not from any book."); }}>Load the sample pack instead</button>}
        </div>
      </section>

      {res?.db && (
        <section className="card p-5" data-testid="import-summary">
          <h2 className="font-semibold">Extraction report — {res.db.book.title}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><div className="label">Diagrams identified</div><div className="text-xl font-semibold">{res.accepted.length + res.rejected.length}</div></div>
            <div><div className="label">Validated</div><div className="text-xl font-semibold text-good" data-testid="n-verified">{verified}</div></div>
            <div><div className="label">Need review</div><div className="text-xl font-semibold text-warn">{res.accepted.length - verified}</div></div>
            <div><div className="label">Rejected</div><div className="text-xl font-semibold text-bad">{res.rejected.length}</div></div>
          </div>
          {report && <p className="mt-3 text-xs text-mute">{String(report.coverageClaim ?? "")} Engine disagreements with the book: {JSON.stringify(report.engineDisagreements ?? [])}.</p>}
          {(report?.errors as string[] | undefined)?.length ? <ul className="mt-2 list-disc pl-5 text-xs text-bad">{(report!.errors as string[]).map((e) => <li key={e}>{e}</li>)}</ul> : null}
          {res.rejected.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-bad">{res.rejected.slice(0, 20).map((r) => <li key={r.id}>{r.id}: {r.errors.join("; ")}</li>)}</ul>}
          {res.db.synthetic && <p className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-2 py-1 text-xs text-warn">Marked as samples or test fixtures — these are not positions from a book.</p>}

          {clusters.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Teach the diagram font {unconfirmed > 0 && <span className="ml-2 text-xs font-normal text-warn">{unconfirmed} low-confidence shapes</span>}</h3>
              <p className="mt-1 text-xs text-mute">Each tile is one distinct square image found in the PDF with the piece the recogniser assumed. Correct any that are wrong, confirm, and re-run: every diagram is rebuilt from your labels.</p>
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
                {clusters.map((c, i) => (
                  <div key={c.id} className={`rounded-lg border p-1.5 text-center ${c.confirmed ? "border-good/50" : c.confidence < 0.6 ? "border-warn/60" : "border-line"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image} alt={`square image ${c.id}`} className="mx-auto h-12 w-12" />
                    <select className="field mt-1 px-1 py-0.5 text-xs" value={c.label ?? "empty"} onChange={(e) => setClusters(clusters.map((x, j) => (j === i ? { ...x, label: e.target.value, confirmed: true } : x)))}>
                      <option value="empty">empty</option>{PIECES.map((p) => <option key={p} value={p}>{GLYPH[p]} {p === p.toUpperCase() ? "white" : "black"}</option>)}</select>
                    <div className="mt-0.5 text-[10px] text-mute">×{c.count} · {Math.round(c.confidence * 100)}%</div>
                  </div>))}
              </div>
              {local && <div className="mt-3 flex gap-2">
                <button className="btn" onClick={() => setClusters(clusters.map((c) => ({ ...c, confirmed: true })))}>Confirm all as shown</button>
                <button className="btn" disabled={!pdf || busy} onClick={() => extract(true)}>{busy ? "Re-running…" : "Re-run with my labels"}</button></div>}
            </div>)}
          <button className="btn btn-primary mt-5" data-testid="save-import" disabled={!res.accepted.length} onClick={save}>Add {res.accepted.length} exercises to my library</button>
        </section>)}

      <section id="review" className="card">
        <div className="p-5"><h2 className="font-semibold">3 · Manual review <span className="ml-2 text-sm font-normal text-mute">{pending.length} waiting</span></h2>
          <p className="mt-1 text-sm text-mute">Exercises the pipeline could not fully validate stay out of training until you compare them with the page and approve them.</p></div>
        {pending.slice(0, 200).map((e) => (
          <div key={e.id} className="border-t border-line">
            <button className="flex w-full items-center justify-between px-5 py-2.5 text-left text-sm hover:bg-panel2" onClick={() => setOpen(open === e.id ? null : e.id)} data-testid={`review-${e.id}`}>
              <span>№ {e.number} <span className="ml-2 text-xs text-mute">{e.chapter.title} · PDF p. {e.pdfPage}</span></span>
              <span className="text-xs text-warn">{e.verification.flags.slice(0, 3).join(", ")}</span></button>
            {open === e.id && <Editor ex={e} onSave={async (x) => { await updateExercise(x); setOpen(null); }} />}
          </div>))}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Library on this device</h2>
        {Object.values(library).length === 0 ? <p className="mt-2 text-sm text-mute">Empty.</p> : (
          <ul className="mt-3 divide-y divide-line">{Object.values(library).map((b) => (
            <li key={b.book.id} className="flex items-center justify-between py-2 text-sm">
              <span>{b.book.title} <span className="ml-2 text-xs text-mute">{b.exercises.length} exercises · {b.exercises.filter((e) => e.verification.status === "verified").length} verified</span></span>
              <button className="btn btn-ghost text-xs text-bad" onClick={() => window.confirm(`Remove “${b.book.title}” and its ${b.exercises.length} exercises from this device?`) && removeBook(b.book.id)}>Remove</button></li>))}</ul>)}
        {Object.values(library).length > 0 && <button className="btn mt-3" onClick={exportLib}>Download private backup</button>}
      </section>
    </div>
  );
}

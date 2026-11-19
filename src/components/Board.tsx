"use client";
import { useEffect, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import { Chess } from "chess.js";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.cburnett.css";
import { legalDests, needsPromotion, type MoveInput } from "@/lib/puzzle";

interface Props {
  fen: string;
  orientation: "white" | "black";
  interactive: boolean;
  onMove?: (m: MoveInput) => void;
  lastMove?: [string, string] | null;
  highlights?: string[];
  resetKey?: number;
}

const PROMO: [string, string][] = [["q", "♕"], ["r", "♖"], ["b", "♗"], ["n", "♘"]];

export default function Board({ fen, orientation, interactive, onMove, lastMove, highlights, resetKey }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  const cb = useRef(onMove);
  const fenRef = useRef(fen);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  // The tap that completes the pawn move also produces a click a moment later; clicks that
  // arrive this soon after the picker opens belong to that tap and must not act on the picker.
  const promoOpenedAt = useRef(0);
  const promoReady = () => Date.now() - promoOpenedAt.current > 400;
  useEffect(() => { cb.current = onMove; fenRef.current = fen; });

  useEffect(() => {
    if (!el.current) return;
    const api = Chessground(el.current, { coordinates: true, animation: { duration: 180 }, highlight: { lastMove: true, check: true }, draggable: { showGhost: true } });
    cg.current = api;
    const ro = new ResizeObserver(() => api.redrawAll());
    ro.observe(el.current);
    return () => { ro.disconnect(); api.destroy(); cg.current = null; };
  }, []);

  useEffect(() => {
    const api = cg.current;
    if (!api) return;
    const turn = fen.split(" ")[1] === "b" ? "black" : "white";
    let inCheck = false, dests = new Map<string, string[]>();
    try { inCheck = new Chess(fen).inCheck(); if (interactive) dests = legalDests(fen); } catch { /* unreviewed FEN: display only */ }
    api.set({
      fen: fen.split(" ")[0], orientation, turnColor: turn, check: inCheck,
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
      movable: {
        free: false, color: interactive ? turn : undefined, dests: dests as Map<Key, Key[]>, showDests: true,
        events: { after: (from, to) => {
          if (needsPromotion(fenRef.current, from, to)) { promoOpenedAt.current = Date.now(); setPromo({ from, to }); }
          else cb.current?.({ from, to });
        } },
      },
      drawable: { enabled: true, autoShapes: (highlights ?? []).map((sq) => ({ orig: sq as Key, brush: "green" })) },
    });
  }, [fen, orientation, interactive, lastMove, highlights, resetKey]);

  const cancelPromo = () => { setPromo(null); cg.current?.set({ fen: fen.split(" ")[0] }); };

  return (
    <div className="relative select-none" data-testid="board" data-fen={fen}>
      <div ref={el} className="cg-wrap" />
      {promo && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/60" data-testid="promo-overlay">
          <div className="card flex flex-col items-center gap-2 p-3" role="dialog" aria-label="Choose promotion piece">
            <div className="flex gap-2">
              {PROMO.map(([p, glyph]) => (
                <button key={p} data-testid={`promo-${p}`} className="btn h-14 w-14 text-4xl leading-none text-white"
                  onClick={() => { if (!promoReady()) return; const m = promo; setPromo(null); cb.current?.({ ...m, promotion: p }); }}>{glyph}</button>
              ))}
            </div>
            <button className="btn btn-ghost text-xs" data-testid="promo-cancel" onClick={() => { if (promoReady()) cancelPromo(); }}>Cancel — take the move back</button>
          </div>
        </div>
      )}
    </div>
  );
}

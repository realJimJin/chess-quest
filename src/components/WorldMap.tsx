"use client";
import type { Ref } from "react";
import type { Campaign, Level } from "@/lib/game";

// Original illustrated terrain with interactive SVG paths and towers.
// Region titles, level states and progress come only from the learning domain.
export const W = 720, DY = 132, TOP = 185;
export const pathX = (k: number) => W / 2 + 170 * Math.sin(k * 0.72);
export const pos = (k: number) => ({ x: pathX(k), y: TOP + k * DY });
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function Tower({ l, selected, current }: { l: Level; selected: boolean; current: boolean }) {
  const locked = l.state === "locked";
  const cleared = l.state === "cleared";
  const accent = cleared ? "#b3d4b3" : locked ? "#829184" : "#e2c790";
  return <g>
    <circle r="46" fill="transparent" />
    {current && <circle className="map-current-halo" r="43" fill="none" stroke={accent} strokeWidth="2" />}
    <circle r="34" fill={selected ? "#ede6d4" : "#142f26"} stroke={accent} strokeWidth={selected ? 3 : 2} />
    <text textAnchor="middle" y="8" fontFamily="var(--font-display)" fontSize="27" fill={selected ? "#183b2e" : accent}>{String(l.index + 1).padStart(2, "0")}</text>
    <g transform="translate(0 50)">
      <rect x="-65" y="-12" width="130" height="26" rx="2" fill="#102a23" opacity=".94" />
      <text textAnchor="middle" y="5" fontSize="12" fill={accent}>{locked ? "Locked" : cleared ? "Completed" : l.boss ? "Boss challenge" : `№ ${l.firstNumber}–${l.lastNumber}`}</text>
    </g>
  </g>;
}

export default function WorldMap({ camp, selectedId, onPick, currentRef }: { camp: Campaign; selectedId: string | null; onPick: (id: string) => void; currentRef: Ref<SVGGElement> }) {
  const n = camp.levels.length;
  const H = Math.max(900, TOP + n * DY + 190);
  const seg = (k: number) => { const p = pos(k); if (k === 0) return `M ${W / 2} 62 C ${W / 2} ${TOP - 40}, ${p.x} ${p.y - 50}, ${p.x} ${p.y}`; const q = pos(k - 1); return `C ${q.x} ${q.y + DY / 2}, ${p.x} ${p.y - DY / 2}, ${p.x} ${p.y}`; };
  const road = camp.levels.map((_, k) => seg(k)).join(" ") + ` C ${pos(n - 1).x} ${pos(n - 1).y + 70}, ${W / 2} ${H - 150}, ${W / 2} ${H - 96}`;
  const firstOpen = camp.levels.findIndex((l) => l.state !== "cleared");
  const lit = camp.levels.slice(0, firstOpen === -1 ? n : firstOpen + 1).map((_, k) => seg(k)).join(" ");
  const bands = camp.regions.map((r, ri) => ({ r, ri, y0: ri === 0 ? 0 : pos(r.levels[0].index).y - DY / 2, y1: ri === camp.regions.length - 1 ? H : pos(r.levels[r.levels.length - 1].index).y + DY / 2 }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="world-map block w-full" role="group" aria-label="Campaign map" data-testid="world-map">
      <defs>
        <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".45" /></radialGradient>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20" /></filter>
      </defs>
      {bands.map(({ r, ri, y0, y1 }) => (
        <g key={r.chapterId}>
          <image href="/art/academy-valley.png" x="0" y={y0} width={W} height={y1-y0} preserveAspectRatio="xMidYMid slice" />
          <rect x="0" y={y0} width={W} height={y1-y0} fill={ri % 2 ? "#10283a" : "#172319"} opacity={ri % 2 ? ".18" : ".08"} />
        </g>
      ))}
      <path d={road} stroke="#142c22" strokeWidth="12" fill="none" strokeLinecap="round" opacity=".65" />
      <path d={road} stroke="#d9c399" strokeWidth="3" fill="none" strokeDasharray="2 12" strokeLinecap="round" opacity=".65" />
      {lit && <path d={lit} stroke="#f5da9d" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="2 12" />}
      <g transform={`translate(${W / 2} 50)`}>
        <rect x="-62" y="-17" width="124" height="34" fill="#102a23" opacity=".95" />
        <text textAnchor="middle" y="5" fontSize="11" fill="#ede6d4" letterSpacing="2">START HERE</text>
      </g>
      {camp.levels.map((l, k) => { const p = pos(k); const isCur = camp.current?.id === l.id; return (
        <g key={l.id} ref={isCur ? currentRef : undefined} transform={`translate(${p.x} ${p.y})`} className="cursor-pointer" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(l.id); } }} aria-pressed={selectedId === l.id} onClick={() => onPick(l.id)} data-testid={`level-${l.index}`} data-state={l.state} role="button" aria-label={`Level ${l.index + 1}, exercises ${l.firstNumber} to ${l.lastNumber}, ${l.state}`}>
          <Tower l={l} selected={selectedId === l.id} current={isCur} /></g>); })}
      <g transform={`translate(${W / 2} ${H - 96})`}>
        <rect x="-94" y="-22" width="188" height="44" fill="#102a23" opacity=".95" />
        <text textAnchor="middle" y="6" fontSize="14" fill="#ede6d4" letterSpacing="2">THE LAST PAGE</text>
      </g>
      {bands.filter((x) => x.r.locked).map(({ r, y0, y1, ri }) => { const rand = rng(ri * 31 + 5); return (
        <g key={`fog-${r.chapterId}`} pointerEvents="none">
          <rect x="0" y={y0 + 14} width={W} height={y1 - y0 - 14} fill="#0b0d10" opacity=".42" />
          <g filter="url(#soft)" opacity=".26">{Array.from({ length: Math.round((y1 - y0) / 55) }, (_, i) => <ellipse key={i} cx={rand() * W} cy={y0 + 30 + rand() * (y1 - y0 - 40)} rx={90 + rand() * 80} ry={26 + rand() * 20} fill="#c7d0db"></ellipse>)}</g>
        </g>); })}
      {bands.map(({ r, ri, y0 }) => (
        <g key={`t-${r.chapterId}`} transform={`translate(14 ${y0 + (ri === 0 ? 96 : 30)})`}>
          <path d="M0 0 h236 l-10 16 l10 16 h-236 Z" fill="#102a23" opacity=".9" stroke="#d7b97a" strokeOpacity=".5" />
          <text x="12" y="13" fontSize="9.5" fontWeight="700" letterSpacing="2" fill="#d7b97a">{`REGION ${ri + 1}`}{r.locked ? " · IN THE FOG" : ` · ${r.solved}/${r.total} SOLVED`}</text>
          <title>{r.title}</title><text x="12" y="26" fontSize="12.5" fontWeight="600" fill="#e7e9ee">{r.title.length > 30 ? `${r.title.slice(0, 29)}…` : r.title}</text>
        </g>))}
      <rect x="0" y="0" width={W} height={H} fill="url(#vig)" pointerEvents="none" />
    </svg>);
}

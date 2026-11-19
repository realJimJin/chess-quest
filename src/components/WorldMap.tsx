"use client";
import type { Ref } from "react";
import type { Campaign, Level } from "@/lib/game";

// Original artwork drawn in SVG: terrain, a winding road, towers for levels and
// fortresses for bosses. Biomes are decoration only; region names are the book's own.
export const W = 720, DY = 112, TOP = 150;
const BIOMES = [
  { name: "meadow", ground: "#3f6b3a", shade: "#345a31", light: "#4c7c45", gap: "#3b7fa6", gapLight: "#6fb3d6" },
  { name: "pinewood", ground: "#2f5340", shade: "#274636", light: "#3a634c", gap: "#3b7fa6", gapLight: "#6fb3d6" },
  { name: "dunes", ground: "#a8874f", shade: "#927443", light: "#bb9a60", gap: "#6d5633", gapLight: "#8a6f45" },
  { name: "frost", ground: "#9fb4c4", shade: "#8aa0b1", light: "#b9cad6", gap: "#5d8fb0", gapLight: "#a9d3ea" },
  { name: "ash", ground: "#4a3f3d", shade: "#3d3432", light: "#5a4c49", gap: "#b4431c", gapLight: "#f59e0b" },
  { name: "citadel", ground: "#4b5160", shade: "#3f4553", light: "#5a6172", gap: "#262b36", gapLight: "#3b4252" },
];
export const pathX = (k: number) => W / 2 + 205 * Math.sin(k * 0.72);
export const pos = (k: number) => ({ x: pathX(k), y: TOP + k * DY });
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function Deco({ kind, x, y, s, v }: { kind: string; x: number; y: number; s: number; v: number }) {
  const t = `translate(${x} ${y}) scale(${s})`;
  const shadow = <ellipse cx="3" cy="2" rx="11" ry="4" fill="#000" opacity=".22" />;
  if (kind === "meadow") return v < 0.7
    ? <g transform={t}>{shadow}<rect x="-2" y="-10" width="4" height="12" fill="#5b4330" /><circle cx="0" cy="-17" r="11" fill="#2f6b34" /><circle cx="-4" cy="-20" r="6" fill="#3f8443" /></g>
    : <g transform={t}><ellipse cx="0" cy="0" rx="8" ry="5" fill="#2f6b34" /><circle cx="-3" cy="-2" r="1.5" fill="#f4d58d" /><circle cx="3" cy="-1" r="1.5" fill="#f2a6a6" /></g>;
  if (kind === "pinewood" || kind === "frost") { const c = kind === "frost" ? ["#3d6b63", "#e8f1f5"] : ["#1f4a33", "#2c6143"]; return v < 0.8
    ? <g transform={t}>{shadow}<rect x="-1.5" y="-4" width="3" height="6" fill="#4a3728" /><path d="M0 -34 L10 -14 L-10 -14 Z" fill={c[0]} /><path d="M0 -26 L12 -4 L-12 -4 Z" fill={c[0]} /><path d="M0 -34 L5 -24 L-5 -24 Z" fill={c[1]} /></g>
    : <g transform={t}>{shadow}<path d="M-9 0 L-5 -9 L4 -11 L10 -3 L7 1 Z" fill={kind === "frost" ? "#c9dbe6" : "#6b7280"} /><path d="M-5 -9 L4 -11 L1 -4 Z" fill={kind === "frost" ? "#eef6fa" : "#8b939e"} /></g>; }
  if (kind === "dunes") return v < 0.5
    ? <g transform={t}><path d="M-22 0 Q0 -14 22 0" fill="none" stroke="#c9aa72" strokeWidth="3" strokeLinecap="round" opacity=".7" /></g>
    : v < 0.8 ? <g transform={t}>{shadow}<path d="M-9 0 L-6 -8 L3 -10 L9 -3 L6 1 Z" fill="#8d6e3f" /><path d="M-6 -8 L3 -10 L0 -4 Z" fill="#a98952" /></g>
      : <g transform={t}><path d="M0 0 L-5 -10 M0 0 L0 -13 M0 0 L5 -9" stroke="#6b5a35" strokeWidth="2" strokeLinecap="round" /></g>;
  if (kind === "ash") return v < 0.45
    ? <g transform={t}>{shadow}<path d="M0 0 L0 -22 M0 -12 L-7 -19 M0 -15 L6 -23" stroke="#231c1b" strokeWidth="3" strokeLinecap="round" fill="none" /></g>
    : v < 0.75 ? <g transform={t}><path d="M-12 0 L-4 -3 L2 2 L11 -2" stroke="#f97316" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".8" /></g>
      : <g transform={t}>{shadow}<path d="M-9 0 L-6 -9 L3 -11 L9 -3 L6 1 Z" fill="#2b2423" /></g>;
  return v < 0.5
    ? <g transform={t}>{shadow}<rect x="-4" y="-22" width="8" height="24" fill="#737b8c" /><rect x="-6" y="-25" width="12" height="4" fill="#8b93a4" /><rect x="-6" y="0" width="12" height="3" fill="#5c6373" /></g>
    : <g transform={t}><rect x="-1" y="-26" width="2" height="28" fill="#3a3f4b" /><path d="M1 -26 L15 -22 L1 -17 Z" fill="#8b5cf6" opacity=".85" /></g>;
}

function Tower({ l, selected, current }: { l: Level; selected: boolean; current: boolean }) {
  const frac = l.solved / l.exerciseIds.length;
  const stars = l.state === "cleared" ? (frac >= 1 ? 3 : frac >= 0.85 ? 2 : 1) : 0;
  const locked = l.state === "locked";
  const stone = locked ? ["#4b5261", "#3a404d", "#2c313b"] : ["#b9c0cb", "#8e97a5", "#646d7b"];
  const flag = l.state === "cleared" ? "#2dd4bf" : "#f59e0b";
  const k = l.boss ? 1.5 : 1;
  return (
    <g>
      <ellipse cx="4" cy={22 * k} rx={30 * k} ry={9 * k} fill="#000" opacity=".3" />
      {selected && <ellipse cx="0" cy={19 * k} rx={33 * k} ry={11 * k} fill="none" stroke="#fbbf24" strokeWidth="2.5" />}
      {current && <ellipse cx="0" cy={19 * k} rx={30 * k} ry={10 * k} fill="none" stroke="#fde68a" strokeWidth="2" opacity=".7"><animate attributeName="rx" values={`${28 * k};${40 * k};${28 * k}`} dur="2.2s" repeatCount="indefinite" /><animate attributeName="opacity" values=".8;0;.8" dur="2.2s" repeatCount="indefinite" /></ellipse>}
      <g transform={`scale(${k})`}>
        <ellipse cx="0" cy="18" rx="24" ry="8" fill={stone[2]} />
        {l.boss && [-22, 22].map((x) => (
          <g key={x} transform={`translate(${x} 0)`}><path d="M-7 18 L-6 -8 L6 -8 L7 18 Z" fill={stone[1]} /><path d="M-8 -8 h4 v-4 h3 v4 h2 v-4 h3 v4 h4 v4 h-16 Z" fill={stone[0]} />{!locked && <path d="M0 -12 L0 -24 M0 -24 L9 -21 L0 -18" stroke="#3a2a1c" strokeWidth="1.5" fill={flag} />}</g>))}
        <path d="M-14 18 L-12 -18 L12 -18 L14 18 Z" fill={stone[1]} />
        <path d="M-14 18 L-12 -18 L-4 -18 L-5 18 Z" fill={stone[0]} opacity=".55" />
        <path d="M-15 -18 h6 v-6 h5 v6 h8 v-6 h5 v6 h6 v5 h-30 Z" fill={stone[0]} />
        <path d="M-5 18 v-9 a5 5 0 0 1 10 0 v9 Z" fill="#1f2430" />
        <rect x="-1.5" y="-10" width="3" height="7" rx="1.5" fill="#1f2430" />
        {!locked && <g><path d="M0 -24 L0 -46" stroke="#3a2a1c" strokeWidth="2" /><path d="M0 -46 L18 -41 L0 -35 Z" fill={flag}><animate attributeName="d" values="M0 -46 L18 -41 L0 -35 Z;M0 -46 L16 -43 L0 -35 Z;M0 -46 L18 -41 L0 -35 Z" dur="2.6s" repeatCount="indefinite" /></path></g>}
        {locked && <g transform="translate(0 -30)"><rect x="-6" y="-2" width="12" height="9" rx="2" fill="#9ca3af" /><path d="M-3.5 -2 v-3 a3.5 3.5 0 0 1 7 0 v3" fill="none" stroke="#9ca3af" strokeWidth="2" /></g>}
      </g>
      {stars > 0 && <text textAnchor="middle" y={-52 * k} fontSize="14" fill="#fcd34d" stroke="#7c5a10" strokeWidth=".6">{"★".repeat(stars)}<tspan fill="#00000055" stroke="none">{"★".repeat(3 - stars)}</tspan></text>}
      {current && <g transform={`translate(${34 * k} ${4 * k})`}><g><animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="1.4s" repeatCount="indefinite" /><ellipse cx="0" cy="15" rx="8" ry="3" fill="#000" opacity=".3" /><path d="M-7 14 Q-7 4 -3 0 L3 0 Q7 4 7 14 Z" fill="#fef3c7" stroke="#92400e" strokeWidth="1.2" /><circle cx="0" cy="-5" r="5.5" fill="#fef3c7" stroke="#92400e" strokeWidth="1.2" /></g></g>}
      <g transform={`translate(0 ${32 * k + 6})`}>
        <rect x="-38" y="-10" width="76" height="19" rx="9.5" fill="#12161c" opacity=".88" stroke={selected ? "#fbbf24" : "#2a323d"} />
        <text textAnchor="middle" y="3.5" fontSize="10.5" fontWeight="600" fill={locked ? "#6b7280" : "#e7e9ee"}>{l.boss ? "Boss · " : `${l.index + 1} · `}№ {l.firstNumber}–{l.lastNumber}</text>
      </g>
    </g>);
}

export default function WorldMap({ camp, selectedId, onPick, currentRef }: { camp: Campaign; selectedId: string | null; onPick: (id: string) => void; currentRef: Ref<SVGGElement> }) {
  const n = camp.levels.length;
  const H = TOP + n * DY + 190;
  const seg = (k: number) => { const p = pos(k); if (k === 0) return `M ${W / 2} 62 C ${W / 2} ${TOP - 40}, ${p.x} ${p.y - 50}, ${p.x} ${p.y}`; const q = pos(k - 1); return `C ${q.x} ${q.y + DY / 2}, ${p.x} ${p.y - DY / 2}, ${p.x} ${p.y}`; };
  const road = camp.levels.map((_, k) => seg(k)).join(" ") + ` C ${pos(n - 1).x} ${pos(n - 1).y + 70}, ${W / 2} ${H - 150}, ${W / 2} ${H - 96}`;
  const firstOpen = camp.levels.findIndex((l) => l.state !== "cleared");
  const lit = camp.levels.slice(0, firstOpen === -1 ? n : firstOpen + 1).map((_, k) => seg(k)).join(" ");
  const bands = camp.regions.map((r, ri) => ({ r, ri, b: BIOMES[ri % BIOMES.length], y0: ri === 0 ? 0 : pos(r.levels[0].index).y - DY / 2, y1: ri === camp.regions.length - 1 ? H : pos(r.levels[r.levels.length - 1].index).y + DY / 2 }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Campaign map" data-testid="world-map">
      <defs>
        <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".45" /></radialGradient>
        <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20" /></filter>
      </defs>
      {bands.map(({ r, ri, b, y0, y1 }) => {
        const rand = rng(ri * 977 + 13);
        const patches = Array.from({ length: Math.round((y1 - y0) / 60) }, () => ({ x: rand() * W, y: y0 + rand() * (y1 - y0), rx: 40 + rand() * 70, ry: 14 + rand() * 22, l: rand() > 0.5 }));
        const decos = Array.from({ length: Math.round((y1 - y0) / 15) }, () => ({ x: 16 + rand() * (W - 32), y: y0 + 26 + rand() * (y1 - y0 - 40), s: 0.8 + rand() * 0.6, v: rand() }))
          .filter((d) => Math.abs(d.x - pathX((d.y - TOP) / DY)) > 78 && !(d.y < 150 && Math.abs(d.x - W / 2) < 110)).sort((a, c) => a.y - c.y);
        return (
          <g key={r.chapterId}>
            <rect x="0" y={y0} width={W} height={y1 - y0} fill={b.ground} />
            {patches.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={p.l ? b.light : b.shade} opacity=".55" />)}
            <g opacity={r.locked ? 0.45 : 1}>{decos.map((d, i) => <Deco key={i} kind={b.name} x={d.x} y={d.y} s={d.s} v={d.v} />)}</g>
          </g>);
      })}
      {bands.slice(1).map(({ r, b, y0 }) => { const bx = pathX((y0 - TOP) / DY); return (
        <g key={`gap-${r.chapterId}`}>
          <path d={`M0 ${y0 - 13} Q ${W * 0.25} ${y0 - 24} ${W * 0.5} ${y0 - 12} T ${W} ${y0 - 14} L ${W} ${y0 + 13} Q ${W * 0.75} ${y0 + 2} ${W * 0.5} ${y0 + 14} T 0 ${y0 + 12} Z`} fill={b.gap} />
          <path d={`M0 ${y0 - 3} Q ${W * 0.25} ${y0 - 13} ${W * 0.5} ${y0 - 2} T ${W} ${y0 - 4}`} stroke={b.gapLight} strokeWidth="2" fill="none" opacity=".6" strokeDasharray="26 18"><animate attributeName="stroke-dashoffset" values="0;-88" dur="6s" repeatCount="indefinite" /></path>
          <g transform={`translate(${bx} ${y0})`}><rect x="-27" y="-21" width="54" height="42" rx="3" fill="#6b4f33" /><path d="M-27 -11 h54 M-27 0 h54 M-27 11 h54" stroke="#4a3522" strokeWidth="2" /><rect x="-30" y="-23" width="5" height="46" fill="#3f2d1d" /><rect x="25" y="-23" width="5" height="46" fill="#3f2d1d" /></g>
        </g>); })}
      <path d={road} stroke="#3b2e20" strokeWidth="34" fill="none" strokeLinecap="round" opacity=".55" />
      <path d={road} stroke="#b08d5b" strokeWidth="26" fill="none" strokeLinecap="round" />
      <path d={road} stroke="#c8a674" strokeWidth="14" fill="none" strokeLinecap="round" opacity=".7" />
      <path d={road} stroke="#8a6c43" strokeWidth="2" fill="none" strokeDasharray="3 15" strokeLinecap="round" opacity=".7" />
      {lit && <path d={lit} stroke="#fde68a" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="1 12" opacity=".95" />}
      <g transform={`translate(${W / 2} 52)`}>
        <ellipse cx="0" cy="18" rx="46" ry="10" fill="#000" opacity=".28" />
        <path d="M-34 16 L0 -30 L34 16 Z" fill="#d9c7a3" stroke="#6b4f33" strokeWidth="2" /><path d="M0 -30 L-8 16 L8 16 Z" fill="#3b2e20" /><path d="M0 -30 L0 -44 M0 -44 L14 -40 L0 -36" stroke="#3a2a1c" strokeWidth="2" fill="#2dd4bf" />
        <text textAnchor="middle" y="38" fontSize="11" fontWeight="700" fill="#fef3c7" letterSpacing="1.5">BASE CAMP</text>
      </g>
      {camp.levels.map((l, k) => { const p = pos(k); const isCur = camp.current?.id === l.id; return (
        <g key={l.id} ref={isCur ? currentRef : undefined} transform={`translate(${p.x} ${p.y})`} className="cursor-pointer" onClick={() => onPick(l.id)} data-testid={`level-${l.index}`} data-state={l.state} role="button" aria-label={`Level ${l.index + 1}, exercises ${l.firstNumber} to ${l.lastNumber}, ${l.state}`}>
          <Tower l={l} selected={selectedId === l.id} current={isCur} /></g>); })}
      <g transform={`translate(${W / 2} ${H - 96})`}>
        <ellipse cx="6" cy="34" rx="110" ry="18" fill="#000" opacity=".35" />
        <path d="M-90 30 L-88 -14 L88 -14 L90 30 Z" fill="#8e97a5" /><path d="M-92 -14 h16 v-9 h12 v9 h16 v-9 h12 v9 h20 v-9 h12 v9 h16 v-9 h12 v9 h20 v-9 h12 v9 h16 v-9 h12 v9 h8 v8 h-184 Z" fill="#b9c0cb" />
        {[-74, 74].map((x) => <g key={x} transform={`translate(${x} 0)`}><path d="M-17 30 L-15 -44 L15 -44 L17 30 Z" fill="#a3abb8" /><path d="M-19 -44 L0 -74 L19 -44 Z" fill="#7c3aed" /><path d="M0 -74 L0 -92 M0 -92 L16 -87 L0 -82" stroke="#3a2a1c" strokeWidth="2" fill="#fbbf24" /></g>)}
        <path d="M-17 30 v-24 a17 17 0 0 1 34 0 v24 Z" fill="#1f2430" /><path d="M-17 30 v-24 a17 17 0 0 1 34 0 v24" fill="none" stroke="#646d7b" strokeWidth="3" />
        <text textAnchor="middle" y="54" fontSize="12" fontWeight="700" fill="#fef3c7" letterSpacing="1.5">THE LAST PAGE</text>
      </g>
      {bands.filter((x) => x.r.locked).map(({ r, y0, y1, ri }) => { const rand = rng(ri * 31 + 5); return (
        <g key={`fog-${r.chapterId}`} pointerEvents="none">
          <rect x="0" y={y0 + 14} width={W} height={y1 - y0 - 14} fill="#0b0d10" opacity=".42" />
          <g filter="url(#soft)" opacity=".26">{Array.from({ length: Math.round((y1 - y0) / 55) }, (_, i) => <ellipse key={i} cx={rand() * W} cy={y0 + 30 + rand() * (y1 - y0 - 40)} rx={90 + rand() * 80} ry={26 + rand() * 20} fill="#c7d0db"><animate attributeName="cx" values={`${-80 + i * 40};${W + 80}`} dur={`${70 + (i % 5) * 18}s`} begin={`${-(i * 13)}s`} repeatCount="indefinite" /></ellipse>)}</g>
        </g>); })}
      {bands.map(({ r, ri, y0 }) => (
        <g key={`t-${r.chapterId}`} transform={`translate(14 ${y0 + (ri === 0 ? 96 : 30)})`}>
          <path d="M0 0 h236 l-10 16 l10 16 h-236 Z" fill="#12161c" opacity=".9" stroke="#fbbf24" strokeOpacity=".5" />
          <text x="12" y="13" fontSize="9.5" fontWeight="700" letterSpacing="2" fill="#fbbf24">{`REGION ${ri + 1}`}{r.locked ? " · IN THE FOG" : ` · ${r.solved}/${r.total} SOLVED`}</text>
          <text x="12" y="26" fontSize="12.5" fontWeight="600" fill="#e7e9ee">{r.title}</text>
        </g>))}
      <rect x="0" y="0" width={W} height={H} fill="url(#vig)" pointerEvents="none" />
    </svg>);
}

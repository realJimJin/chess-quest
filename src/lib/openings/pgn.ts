// Build a repertoire from a player's own games (PGN), so the trainer drills the
// moves they actually played, weighted by how often.
import { Chess } from "chess.js";
import { addMoves, emptyGraph, type Repertoire } from "./graph";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const splitPgn = (text: string): string[] => text.replace(/\r/g, "").split(/\n(?=\[Event\s)/).map((g) => g.trim()).filter(Boolean);
const headers = (game: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of game.matchAll(/^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm)) out[m[1]] = m[2];
  return out;
};
/** Every word of the query must appear in the name, in any order ("yunker alisa" matches "Yunker, Alisa Genrietta"). */
export const nameMatches = (name: string, query: string): boolean => {
  const n = ` ${norm(name)} `, words = norm(query).split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => n.includes(` ${w}`));
};

export interface PgnImport { repertoire: Repertoire; total: number; used: number; asWhite: number; asBlack: number; unreadable: number; otherPlayers: string[] }

/** `maxPlies` is how deep each game is followed (24 = the first 12 moves). */
export function repertoireFromPgn(text: string, player: string, maxPlies = 24): PgnImport {
  const white = emptyGraph("white"), black = emptyGraph("black");
  const games = splitPgn(text);
  const names = new Set<string>(), others = new Map<string, number>();
  let asWhite = 0, asBlack = 0, unreadable = 0;
  for (const game of games) {
    const h = headers(game);
    const w = h.White ?? "", b = h.Black ?? "";
    const isW = nameMatches(w, player), isB = nameMatches(b, player);
    if (isW === isB) {                       // neither, or the query matches both players
      for (const x of [w, b]) if (x) others.set(x, (others.get(x) ?? 0) + 1);
      continue;
    }
    if (h.FEN || (h.Variant && !/standard|^$/i.test(h.Variant))) { unreadable++; continue; }
    let sans: string[];
    try { const c = new Chess(); c.loadPgn(game, { strict: false }); sans = c.history(); } catch { unreadable++; continue; }
    if (sans.length < 2) { unreadable++; continue; }
    const label = [h.ECO, h.Opening].filter(Boolean).join(" ").slice(0, 60);
    addMoves(isW ? white : black, sans, label, 1, maxPlies);
    names.add(isW ? w : b);
    if (isW) asWhite++; else asBlack++;
  }
  const used = asWhite + asBlack, players = [...names].sort();
  return {
    repertoire: {
      id: `games:${norm(player).replace(/ /g, "-")}`, name: `${players[0] ?? player} — from ${used} game${used === 1 ? "" : "s"}`, source: "games",
      note: `Built from ${used} of the player's own games (${asWhite} as White, ${asBlack} as Black), first ${Math.ceil(maxPlies / 2)} moves each. The trainer accepts every move they played in a position and tells you how often.`,
      white, black, games: { used, asWhite, asBlack, players },
    },
    total: games.length, used, asWhite, asBlack, unreadable,
    otherPlayers: [...others.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n),
  };
}

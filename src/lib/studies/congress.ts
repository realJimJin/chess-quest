import { Chess } from 'chess.js';
import data from './data/congress.json';

export interface StudyChapter {
  id: string; title: string; section: string; groups: string[]; note: string;
  confidence: string; orientation: 'white' | 'black'; side: 'white' | 'black' | null;
  url: string; date: string; white: string; black: string; result: string;
  gameType: string; moves: string[]; trainingPlies: number;
  annotations: Record<string, string | undefined>;
  opponentEvidence: { title: string; url: string; identity: string; scope: string }[];
}
export const CONGRESS = data as Omit<typeof data, 'chapters'> & { chapters: StudyChapter[] };
export const STUDY_PATH = '/studies/philidalphia-national-congress';
export function compileChapter(chapter: StudyChapter) {
  const game = new Chess();
  const positions = [game.fen()];
  const moves = chapter.moves.map(san => {
    const move = game.move(san);
    positions.push(game.fen());
    return move;
  });
  return { positions, moves };
}
export function practicePlies(chapter: StudyChapter) {
  return chapter.side ? chapter.moves.slice(0, chapter.trainingPlies).flatMap((_, ply) =>
    ply % 2 === (chapter.side === 'white' ? 0 : 1) ? [ply] : []) : [];
}
export const progressKey = (chapter: StudyChapter, ply: number) => `${chapter.id}:${ply}`;
const allowed = new Set(CONGRESS.chapters.flatMap(c => practicePlies(c).map(p => progressKey(c, p))));
export function parseProgress(value: string | null): string[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Invalid study progress');
  return [...new Set(parsed.filter((key): key is string => typeof key === 'string' && allowed.has(key)))];
}
export const congressProgressStore = {
  load: () => parseProgress(localStorage.getItem('cq:congress:v1:recall')),
  save: (keys: string[]) => localStorage.setItem('cq:congress:v1:recall', JSON.stringify(keys)),
};
export type CongressProgressStore = typeof congressProgressStore;

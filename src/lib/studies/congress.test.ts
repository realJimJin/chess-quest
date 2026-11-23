import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { CONGRESS, compileChapter, parseProgress, practicePlies } from './congress';
import corpus from '../openings/data/yunker-games.json';
import audit from '../../../docs/CONGRESS_SOURCE_AUDIT.json';

describe('Congress source study', () => {
  it('contains every prepared scouting chapter and only original-source Yunker lines', () => {
    expect(CONGRESS.chapters).toHaveLength(55);
    expect(new Set(CONGRESS.chapters.map(c => c.id)).size).toBe(55);
    const selected = CONGRESS.chapters.filter(c => c.section === 'yunker');
    expect(selected).toHaveLength(27);
    let drills = 0;
    for (const c of CONGRESS.chapters) {
      const compiled = compileChapter(c);
      expect(compiled.positions.length).toBe(c.moves.length + 1);
      if (c.section === 'yunker') {
        const evidence = audit.chapters.find(a => a.chapter === c.id)!;
        const source = corpus.find(g => g.id === evidence.sourceGameId)!;
        expect(c.moves.slice(0, source.moves.length)).toEqual(source.moves);
        expect(c.side).toBe(source.side);
        expect(c.url).toBe(source.url);
        expect(evidence.originalMoveOrder).toBe(true);
        expect(evidence.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
        for (const ply of practicePlies(c)) expect(new Chess(compiled.positions[ply]).turn()).toBe(c.side === 'white' ? 'w' : 'b');
      } else { expect(c.side).toBe(null); expect(practicePlies(c)).toEqual([]); }
      drills += practicePlies(c).length;
    }
    expect(drills).toBe(222);
    expect(audit.removedCoachingChapters).toHaveLength(3);
  });
  it('exports 55 legal PGN chapters that can be reimported', () => {
    const pgn = readFileSync('public/studies/philidalphia-national-congress.pgn', 'utf8');
    const games = pgn.trim().split(/\n\s*(?=\[Event )/);
    expect(games).toHaveLength(55);
    games.forEach((text, i) => { const game = new Chess(); game.loadPgn(text); expect(game.history()).toEqual(CONGRESS.chapters[i].moves); });
  });
  it('filters obsolete recall keys without overwriting corrupt data', () => {
    expect(parseProgress(null)).toEqual([]);
    expect(parseProgress('["lockett-benko:0","lockett-benko:0","unknown:0",42]')).toEqual(['lockett-benko:0']);
    expect(() => parseProgress('broken')).toThrow();
    expect(() => parseProgress('{}')).toThrow();
  });
});

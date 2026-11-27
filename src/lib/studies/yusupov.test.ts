import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { YUSUPOV_BOOKS, replayLine } from './yusupov';
import { validateDb } from '../validate';
import { createPuzzle, tryMove } from '../puzzle';

describe('Yusupov excerpt companions', () => {
  it('keeps the orange books in order and never labels the sample packs as full books', () => {
    expect(YUSUPOV_BOOKS.map(b => b.title)).toEqual(['Build Up Your Chess 1', 'Boost Your Chess 1', 'Chess Evolution 1']);
    expect(new Set(YUSUPOV_BOOKS.flatMap(b => b.positions.map(p => p.exercise.id))).size).toBe(9);
    for (const book of YUSUPOV_BOOKS) {
      expect(book.id).toMatch(/-samples$/);
      expect(book.pack.book.title).toContain('Selected sample positions');
      expect(book.pdfUrl).toMatch(/^https:\/\/www.newinchess.com\/media\//);
      const checked = validateDb(book.pack);
      expect(checked.error).toBeUndefined();
      expect(checked.rejected).toEqual([]);
      expect(checked.accepted).toHaveLength(3);
    }
  });

  for (const book of YUSUPOV_BOOKS) for (const position of book.positions) {
    it(`replays and completes the trainer for ${position.id}`, () => {
      for (const line of position.lines) {
        const frames = replayLine(position.fen, line);
        expect(frames).toHaveLength(line.split(' ').length + 1);
        if (line.endsWith('#')) expect(new Chess(frames.at(-1)!.fen).isCheckmate()).toBe(true);
      }
      let puzzle = createPuzzle(position.fen, position.exercise.solution);
      let decisions = 0;
      while (!puzzle.done) {
        const move = puzzle.options[0].uci;
        const outcome = tryMove(puzzle, { from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        if (outcome.kind !== 'book') throw new Error(`Unexpected trainer result: ${outcome.kind}`);
        puzzle = outcome.puzzle;
        expect(++decisions).toBeLessThan(30);
      }
      expect(decisions).toBeGreaterThan(0);
    });
  }

  it('requires the knight promotion when Lasker’s king captures on a7', () => {
    const p = YUSUPOV_BOOKS[0].positions[0];
    const frames = replayLine(p.fen, p.lines[0]);
    const beforePromotion = new Chess(frames.at(-2)!.fen);
    beforePromotion.move('bxc8=Q');
    beforePromotion.move('Qe1#');
    expect(beforePromotion.isCheckmate()).toBe(true);
    const correct = new Chess(frames.at(-1)!.fen);
    expect(correct.get('c8')?.type).toBe('n');
    expect(correct.inCheck()).toBe(true);
  });
});

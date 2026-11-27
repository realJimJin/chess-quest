import { Chess } from 'chess.js';
import type { Exercise, ExerciseDb, SolNode } from '../types';

export const YUSUPOV_PATH = '/studies/yusupov-fundamentals';

interface PositionSeed {
  id: string; title: string; source: string; pdfPage: number; printedPage: number;
  fen: string; lines: string[]; note: string; difficulty: number;
}
export interface YusupovPosition extends PositionSeed { exercise: Exercise }
export interface YusupovBook {
  id: string; title: string; chapter: string; pdfUrl: string; editionUrl: string;
  positions: YusupovPosition[]; pack: ExerciseDb;
}

// Only selected positions from the publisher's free excerpts. No scans, chapter
// text, or complete books are bundled. The short explanations are Chess Quest's.
// Source diagrams were visually checked; every stored branch is checked below.
function book(shortId: string, title: string, chapter: string, pdfName: string, edition: string, seeds: PositionSeed[]): YusupovBook {
  const id = `yusupov-${shortId}-samples`;
  const positions = seeds.map(seed => {
    const solution: SolNode[] = [];
    for (const line of seed.lines) {
      const chess = new Chess(seed.fen);
      let options = solution;
      for (const san of line.split(' ')) {
        const move = chess.move(san);
        const uci = move.from + move.to + (move.promotion ?? '');
        let node = options.find(n => n.uci === uci);
        if (!node) { node = { san: move.san, uci, children: [] }; options.push(node); }
        options = node.children;
      }
    }
    const sideToMove = new Chess(seed.fen).turn() === 'w' ? 'white' : 'black';
    const exercise: Exercise = {
      id: `${id}:${seed.id}`, bookId: id, chapter: { id: shortId, title: chapter },
      number: seeds.indexOf(seed) + 1, numberSource: seed.source,
      pdfPage: seed.pdfPage, printedPage: seed.printedPage, fen: seed.fen, sideToMove,
      instruction: `${sideToMove === 'white' ? 'White' : 'Black'} to move · find the idea`,
      instructionSource: 'Chess Quest', goal: seed.title,
      solutionRaw: seed.lines[0], solution, explanation: seed.note,
      difficulty: { value: seed.difficulty, source: 'estimate', basis: 'Chess Quest estimate, not the book’s scoring system' },
      verification: { status: 'verified', fenConfidence: 1, fenLegal: true, solutionLegal: true, engine: null, flags: [] },
    };
    return { ...seed, exercise };
  });
  return {
    id, title, chapter,
    pdfUrl: `https://www.newinchess.com/media/wysiwyg/product_pdf/${pdfName}.pdf`,
    editionUrl: `https://chesstempo.com/chess-books/${edition}`,
    positions,
    pack: {
      schema: 'chess-school-trainer/exercises@1',
      book: { id, title: `${title} · Selected sample positions`, author: 'Artur Yusupov', edition: 'Publisher excerpt · Chess Quest companion' },
      generatedAt: '2026-11-25T00:00:00Z', exercises: positions.map(p => p.exercise),
    },
  };
}

export const YUSUPOV_BOOKS: YusupovBook[] = [
  book('build1', 'Build Up Your Chess 1', 'Chapter 21 · Pawn combinations', 'Build-up-Your-Chess-1-exceprt', 'build-up-your-chess-1-fundamentals/book/839', [
    {
      id: 'lasker', title: 'A knight, not a queen', source: 'Diagram 21-1 · Em. Lasker, 1900', pdfPage: 4, printedPage: 202,
      fen: '1k1r4/pP2q3/8/Q7/8/6bP/6P1/2R4K w - - 0 1',
      lines: ['Rc8+ Rxc8 Qxa7+ Kxa7 bxc8=N+', 'Rc8+ Kxb7 Rxd8', 'Rc8+ Rxc8 Qxa7+ Kc7 bxc8=Q+'],
      note: 'On a7 the king makes knight promotion a checking fork. Promoting to a queen there allows ...Qe1 mate. Check the other king replies too.', difficulty: 5,
    },
    {
      id: 'passed-pawns', title: 'Two pawns against a rook', source: 'Diagram 21-3', pdfPage: 5, printedPage: 203,
      fen: '7k/8/8/8/1p6/r1p5/P1R5/5K2 b - - 0 1',
      lines: ['Rxa2 Rxa2 b3 Ra8+ Kg7 Ke2 b2 Rb8 c2', 'Rxa2 Rxa2 b3 Ra8+ Kg7 Rb8 c2', 'Rxa2 Rxa2 b3 Ra8+ Kg7 Rc8 b2'],
      note: 'The rook sacrifice clears the way for both pawns. Advance the pawn the opposing rook cannot safely stop; one will promote.', difficulty: 4,
    },
    {
      id: 'tarrasch-lasker', title: 'The central pawn fork', source: 'Diagram 21-6 · Tarrasch–Lasker, Berlin 1916', pdfPage: 6, printedPage: 204,
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 4 4',
      lines: ['Nxe4 Nxe4 d5 Bd3 dxe4 Bxe4 Bd6', 'Nxe4 Bxf7+ Kxf7 Nxe4 d5 Neg5+ Kg8'],
      note: 'Temporarily give up the knight, then fork bishop and knight with ...d5. The main line reaches a playable, equal position for Black—not a forced win.', difficulty: 3,
    },
  ]),
  book('boost1', 'Boost Your Chess 1', 'Chapter 1 · The windmill', 'Boost-Your-Chess-1-excerpt', 'boost-your-chess-1-fundamentals/book/993', [
    {
      id: 'torre-lasker', title: 'Torre’s windmill', source: 'Diagram 1-1 · Torre–Lasker, Moscow 1925', pdfPage: 3, printedPage: 8,
      fen: 'r3rnk1/pb3pp1/3pp2p/1q4BQ/1P1P4/4N1R1/P4PPP/4R1K1 w - - 0 1',
      lines: ['Bf6 Qxh5 Rxg7+ Kh8 Rxf7+ Kg8 Rg7+ Kh8 Rxb7+ Kg8 Rg7+ Kh8 Rg5+ Kh7 Rxh5 Kg6 Rh3 Kxf6 Rxh6+'],
      note: 'The bishop on f6 lets the rook capture with discovered check. Collect material before recovering the queen; Torre finishes this sequence three pawns ahead.', difficulty: 5,
    },
    {
      id: 'smyslov-euwe', title: 'A battery that ends in mate', source: 'Diagram 1-2 · Analysis from Smyslov–Euwe, Zürich 1953', pdfPage: 4, printedPage: 9,
      fen: 'k1n1r3/p2R2bb/2p2qpp/4pp2/2P5/2B1Q1P1/PP3PBP/6K1 w - - 0 1',
      lines: ['Bxe5 Rxe5 Qxe5 Qxe5 Bxc6+ Kb8 Rb7+ Ka8 Rb5#'],
      note: 'This is an analysis line, not the game continuation. Deflect the defenders, then coordinate the bishop and rook to close the king’s escape squares.', difficulty: 4,
    },
    {
      id: 'beni-schwarzbach', title: 'Open both diagonals', source: 'Exercise 1-3 · Beni–Schwarzbach, Austria 1969', pdfPage: 6, printedPage: 11,
      fen: 'r4rk1/1p1n1ppp/p1b4q/5P2/3BP3/1BP2Q2/P1P4P/1K4R1 w - - 0 1',
      lines: ['Qh3 Qxh3 Rxg7+ Kh8 Rxf7+ Kg8 Rg7+ Kh8 Rg8#', 'Qh5 Qxh5 Rxg7+ Kh8 Rxf7+ Kg8 Rg7+ Kh8 Rg8#'],
      note: 'Deflect the queen away from the centre. The two bishops then support the rook’s checking route to g8. Both Qh3 and Qh5 work.', difficulty: 5,
    },
  ]),
  book('evolution1', 'Chess Evolution 1', 'Chapter 3 · Queen sacrifices', 'Chess-Evolution-1-excerpt', 'chess-evolution-1-fundamentals/book/994', [
    {
      id: 'bolbochan-pachman', title: 'Draw the king onto f7', source: 'Exercise 3-1 · Bolbochan–Pachman, Moscow Olympiad 1956', pdfPage: 7, printedPage: 31,
      fen: '3qr1k1/pbr1bp1p/1pn1p1pB/8/2BP1QN1/2P3P1/P4P1P/2R1R1K1 w - - 0 1',
      lines: ['Qxf7+ Kxf7 Bxe6#'],
      note: 'The queen sacrifice draws the king onto the e-file. The bishop’s next capture gives check while the rook prevents the king escaping along that file.', difficulty: 2,
    },
    {
      id: 'urusov-kalinovsky', title: 'Make room for the bishop', source: 'Exercise 3-2 · Urusov–Kalinovsky, St Petersburg 1880', pdfPage: 7, printedPage: 31,
      fen: '5rk1/7p/b2pNp2/3P1N2/1p2P3/6KP/P2Q1P2/2B1nq2 w - - 0 1',
      lines: ['Qg5+ fxg5 Nh6+ Kh8 Bb2+ Rf6 Bxf6#', 'Qg5+ Kf7 Qg7+ Ke8 Qe7#'],
      note: 'Offer the queen with check. If the pawn captures, the knight moves with tempo and clears the bishop’s diagonal. If the king declines, keep checking with the queen.', difficulty: 4,
    },
    {
      id: 'emmrich-moritz', title: 'Two knights finish the attack', source: 'Exercise 3-5 · Missed line in Emmrich–Moritz, Germany 1922', pdfPage: 7, printedPage: 31,
      fen: '2k5/ppp3pp/8/NQ2n2q/2Pp1n2/R4bP1/1P3P1P/4R1K1 b - - 0 1',
      lines: ['Qxh2+ Kxh2 Ng4+ Kg1 Nh3+ Kf1 Nh2#'],
      note: 'Black missed this mate in the game. The queen draws the king out; alternating knight checks drive it into a mating net.', difficulty: 4,
    },
  ]),
];

export const yusupovBook = (id: string) => YUSUPOV_BOOKS.find(b => b.id === id);

export function replayLine(fen: string, line: string) {
  const chess = new Chess(fen);
  const frames: { fen: string; label: string; last: [string, string] | null }[] = [{ fen, label: 'Starting position', last: null }];
  for (const san of line.split(' ')) {
    const number = chess.fen().split(' ')[5];
    const prefix = chess.turn() === 'w' ? `${number}.` : `${number}…`;
    const move = chess.move(san);
    frames.push({ fen: chess.fen(), label: `${prefix} ${move.san}`, last: [move.from, move.to] });
  }
  return frames;
}

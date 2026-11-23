// Rebuild from the original research bundle; source files are deliberately not
// shipped. Usage: node scripts/build-congress-study.cjs /path/to/outputs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Chess } = require('chess.js');
const root = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) throw new Error('Provide the research outputs directory');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const research = path.join(input, 'National_Chess_Congress_2026');
const raw = path.join(input, 'yunker-tournament-prep');
const prior = read(path.join(research, 'yunker-matchups/study-data.json'));
const scouting = read(path.join(research, 'study/study-data.json'));
const corpus = read(path.join(root, 'src/lib/openings/data/yunker-games.json'));
const manifest = read(path.join(raw, 'corpus-manifest.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checkedFiles = new Map();
function originalFile(file) {
  const bytes = fs.readFileSync(path.join(raw, file));
  const sha256 = hash(bytes);
  assert.equal(sha256, manifest.files.find(f => f.file === file)?.sha256, `Original source hash: ${file}`);
  checkedFiles.set(file, sha256);
  return bytes.toString('utf8');
}
function originalGame(g) {
  let pgn, file;
  if (g.source === 'online') {
    file = `chesscom-archives/${g.date.slice(0, 7)}.json`;
    const entry = JSON.parse(originalFile(file)).games.find(x => x.url === g.url);
    assert(entry, `Source missing: ${g.url}`);
    assert.equal(entry[g.side].username.toLowerCase(), 'yunker_alisa');
    pgn = entry.pgn;
  } else {
    file = `broadcasts/${g.url.split('/').at(-2)}.pgn`;
    const games = originalFile(file).split(/(?=\[Event ")/).filter(s => s.trim());
    pgn = games.find(s => s.includes(g.url));
    assert(pgn, `Broadcast missing: ${g.url}`);
  }
  // Preserve original move text; remove clocks/comments and read headers
  // separately because source broadcasts sometimes contain unescaped quotes.
  const headers = Object.fromEntries([...pgn.matchAll(/^\[(\w+)\s+"(.*)"\]\s*$/gm)].map(m => [m[1], m[2]]));
  const board = new Chess();
  board.loadPgn(pgn.replace(/^\[.*\]\s*$/gm, '').replace(/\{[^}]*\}/g, ' ').replace(/\$\d+/g, ''), { strict: false });
  if (g.source !== 'online') assert.equal(headers[g.side === 'white' ? 'WhiteFideId' : 'BlackFideId'], '55724353');
  const moves = board.history();
  assert.deepEqual(moves.slice(0, g.moves.length), g.moves, `Corpus differs from source: ${g.id}`);
  return { moves, file, headers, gameSha256: hash(pgn) };
}
const replacements = {
  'lockett-panov': { title: 'Black: Yunker’s Panov with ...g6', note: 'Original tournament move order: 5.Nc3 g6 6.Nf3 Bg7. Lockett’s example instead plays 5.Nf3. No unrecorded reply to that different position is taught here.', annotations: { 10: 'Against 5.Nc3, Yunker plays ...g6 to prepare the bishop’s development to g7.', 12: 'After 6.Nf3, develop ...Bg7.', 14: 'Castle.', 16: 'Develop ...Nc6, increasing pressure on d4.' } },
  'slav-white': { title: 'White: Exchange Slav, her original 1.c4 move order', note: 'Yunker’s source starts 1.c4 c6 2.d4 d5. This reaches an Exchange Slav structure, but the moves here retain her exact order.', annotations: { 1: 'Her recorded first move is c4.', 3: 'After ...c6, occupy d4.', 5: 'Exchange on d5.', 9: 'Develop Bf4 before e3.', 15: 'Rc1 uses the open c-file.' } },
  'ruttle-g3': { title: 'Black: ...c6/...g6 against Nf3 and g3', note: 'Original Yunker game: 1.Nf3 c6 2.d4 d5 3.g3 Nf6. Ruttle’s probable account has shown a similar setup through a different order; this is not his exact continuation.', annotations: { 2: 'Yunker answers 1.Nf3 with ...c6 in this game.', 4: 'Occupy d5 after 2.d4.', 6: 'Develop ...Nf6.', 8: 'Prepare ...Bg7 with ...g6.' } },
  'reichfeld-qgd': { note: 'A recorded Yunker Exchange QGD. It reaches the same position after 4...exd5 as Reichfeld’s matched account, by a different move order. His later ...Be7/...Be6 sequence is not covered by this source.' },
  'ruttle-slav-exchange': { note: 'The candidate account reached the same position after 5...Nc6, then played h3. Yunker’s game instead continues 6.Bf4. No verified Yunker response to that h3 deviation was recovered.' },
  'slav-main': { note: 'Yunker’s recorded main Slav after Nc3. The early Bf4 position without Nc3 is different; no source-backed reply to that particular deviation was recovered.' },
  'reichfeld-exchange': { note: 'Yunker and the Reichfeld account reach the same position after h3 through different move orders. Yunker then captures ...Bxf3. This is a position match, not eleven identical opening plies.' },
  'reichfeld-grunfeld': { note: 'Yunker’s recorded Grünfeld move order reaches the same position after 6.e3 as Reichfeld’s account, with c4 and Nf3 played in a different order. Her game then diverges from his recorded ...c5 reply.' },
};
const selected = prior.chapters.filter(c => c.sourceGameId).map(c => ({ ...c, ...replacements[c.id] }));
for (const [gameId, suffix, title] of [['e463c826c82d7ff7', 'e3', 'White: Benko, Yunker’s 5.e3 alternative'], ['5aba9228972b9cef', 'bxa6', 'White: Benko, Yunker’s 5.bxa6 alternative']]) {
  const g = corpus.find(g => g.id === gameId); assert(g);
  selected.push({ id: `benko-${suffix}`, title, sourceGameId: gameId, moves: g.moves.slice(0, 16), groups: ['white', 'lockett'], annotations: {}, note: 'Another recorded choice by Yunker. Learn it as a separate branch; this sample does not establish her main or only Benko preference.', opponentEvidence: [] });
}
const audits = [];
const chapters = selected.map(c => {
  const g = corpus.find(g => g.id === c.sourceGameId); assert(g);
  const source = originalGame(g);
  const trainingPlies = ['lockett-benko', 'lockett-panov'].includes(c.id) ? 24 : c.moves.length;
  assert(trainingPlies <= source.moves.length);
  const evidence = (c.opponentEvidence || []).map(e => {
    const other = scouting.chapters.find(o => o.url === e.url); assert(other);
    let common = 0;
    while (common < Math.min(source.moves.length, other.moves.length) && source.moves[common] === other.moves[common]) common++;
    return { title: e.title, url: e.url, identity: e.identity, scope: `${common} identical starting half-moves. Any later response is from Yunker’s source game; the opponent may deviate.` };
  });
  audits.push({ chapter: c.id, sourceGameId: g.id, url: g.url, side: g.side, sourceFile: source.file, sourceSha256: checkedFiles.get(source.file), gameSha256: source.gameSha256, fullGamePlies: source.moves.length, trainingPlies, originalMoveOrder: true, identity: g.source === 'online' ? 'Linked account Yunker_Alisa' : 'FIDE 55724353' });
  return { id: c.id, title: c.title, section: 'yunker', groups: [...new Set(['all', 'yunker', ...c.groups])], note: c.note, confidence: 'Recorded Yunker game', orientation: g.side, side: g.side, url: g.url, date: g.date, white: g.white, black: g.black, result: g.result, gameType: `${g.source} · ${g.timeClass}`, moves: source.moves, trainingPlies, annotations: c.annotations, opponentEvidence: evidence };
});
for (const c of scouting.chapters.filter(c => c.group !== 'models')) {
  const section = c.group === 'jim' ? 'history' : 'opponents';
  chapters.push({ id: `observed-${c.id}`, title: c.title, section, groups: ['all', section, c.group], note: c.note, confidence: c.confidence, orientation: c.orientation, side: null, url: c.url, date: c.date, white: c.white, black: c.black, result: c.result, gameType: c.group === 'narayana' ? 'Unverified indexed fragment' : `Observed score · ${c.time || 'time control unspecified'}`, moves: c.moves, trainingPlies: 0, annotations: c.annotations || {}, opponentEvidence: [] });
}
const summary = {
  ruttle: 'Probable account, not federation-ID verified. Recorded games and relevant Yunker models are together here. Her exact replies to the early Bf4 and h3 deviations remain unverified.',
  caro: 'Recorded Caro-Kann games: Advance, Exchange, Panov, Tartakower and Two Knights. Every move order is preserved from its source.',
  slav: 'Recorded Slav structures and early sidelines. No invented replies are inserted to fill opponent deviations.',
  all: 'All preparation in one study: Yunker’s actual games, opponent observations, and your earlier games. Only Yunker chapters teach your new repertoire.',
};
const groups = [{ id: 'yunker', name: 'Yunker repertoire', summary: '27 recorded games, with her original move orders. Learn the opening, practice her side, or replay the full game. This is a selected sample, not an exhaustive repertoire.' }, { id: 'opponents', name: 'Opponent games', summary: 'Observed opponent moves, with account confidence shown. These are scouting evidence, not moves attributed to Yunker.' }, { id: 'history', name: 'Your earlier games', summary: 'Your public games before the repertoire switch. Included for reference, not as part of Yunker’s repertoire.' }, ...prior.groups.map(g => ({ ...g, summary: summary[g.id] || g.summary })), { id: 'jim', name: 'Jim Jin', summary: 'Your earlier public games, kept separately from your new Yunker repertoire.' }];
groups.find(g => g.id === 'lockett').summary = 'Verified account. Benko as Black; Panov and Exchange Caro-Kann as White. The Panov source uses a different fifth-move order.';
const study = { title: 'Philidalphia national congress', checked: '2026-11-22', version: 1, groups, chapters };
const pgn = chapters.map(c => {
  const game = new Chess();
  game.header('Event', study.title + ' — ' + c.title, 'Site', c.url, 'White', c.white, 'Black', c.black, 'Result', '*', 'Date', c.date.replaceAll('-', '.'), 'Section', c.section, 'Evidence', c.confidence, 'TrainingSide', c.side || 'none', 'SourceResult', c.result);
  game.setComment(c.note);
  for (let i = 0; i < c.moves.length; i++) { game.move(c.moves[i]); if (c.annotations[i + 1]) game.setComment(c.annotations[i + 1]); }
  return game.pgn();
}).join('\n\n') + '\n';
fs.mkdirSync(path.join(root, 'src/lib/studies/data'), { recursive: true });
fs.mkdirSync(path.join(root, 'public/studies'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/lib/studies/data/congress.json'), JSON.stringify(study, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'public/studies/philidalphia-national-congress.pgn'), pgn);
fs.writeFileSync(path.join(root, 'docs/CONGRESS_SOURCE_AUDIT.json'), JSON.stringify({ checked: study.checked, chapters: audits, sourceFiles: [...checkedFiles].map(([file, sha256]) => ({ file, sha256 })), removedCoachingChapters: prior.chapters.filter(c => !c.sourceGameId).map(c => c.id), restoredMoveOrders: ['lockett-panov', 'slav-white', 'ruttle-g3'] }, null, 2) + '\n');
console.log(JSON.stringify({ chapters: chapters.length, yunker: audits.length, sourceFiles: checkedFiles.size, trainingMoves: chapters.reduce((n, c) => n + Math.floor((c.trainingPlies + (c.side === 'white' ? 1 : 0)) / 2), 0) }));

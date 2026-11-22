// Rebuild from cached, public Chess.com monthly JSON and Lichess broadcast PGNs.
// No credentials, engine opinions or invented opening continuations are used.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Chess } from 'chess.js';

const input = process.argv[2];
if (!input) throw new Error('Pass the directory containing chesscom-archives/ and broadcasts/.');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const split = text => text.trim().split(/\n\s*(?=\[Event\s)/).filter(Boolean);
const games = [], excluded = [], files = [], seen = new Set();
const family = (eco, opening) => {
  const named = [ ['Caro-Kann', /Caro.Kann/i], ['Grünfeld', /Gr[uü]nfeld/i], ['Nimzo-Indian', /Nimzo.Indian/i], ["King’s Indian", /King.?s.Indian/i], ['Benoni', /Benoni/i], ['Slav / Semi-Slav', /Slav/i], ['Queen’s Gambit Accepted', /Gambit.Accepted/i], ['Queen’s Gambit Declined', /Gambit.Declined|Tarrasch|Ragozin/i], ['Catalan', /Catalan/i], ['English', /English/i], ['Queen’s Indian', /Queen.?s.Indian/i], ['Dutch', /Dutch/i], ['French', /French/i], ['Pirc / Modern', /Pirc|Modern.Defen/i], ['Sicilian', /Sicilian/i], ['Scandinavian', /Scandinavian/i], ['Réti / flank openings', /Reti|Réti|Larsen|Zukertort/i] ];
  for (const [name, re] of named) if (re.test(opening)) return name;
  const n = Number(eco.slice(1));
  if (eco[0] === 'D') return n >= 70 ? 'Grünfeld' : n >= 30 ? 'Queen’s Gambit Declined' : n >= 20 ? 'Queen’s Gambit Accepted' : n >= 10 ? 'Slav / Semi-Slav' : 'Other queen’s-pawn systems';
  if (eco[0] === 'E') return n >= 60 ? 'King’s Indian' : n >= 20 ? 'Nimzo-Indian' : n >= 10 ? 'Queen’s Indian' : 'Catalan / Indian systems';
  if (eco[0] === 'B') return n >= 20 ? 'Sicilian' : n >= 10 ? 'Caro-Kann' : n >= 6 ? 'Pirc / Modern' : 'Other king’s-pawn systems';
  if (eco[0] === 'C') return n < 20 ? 'French' : 'Open games';
  if (eco[0] === 'A') return n >= 80 ? 'Dutch' : n >= 56 ? 'Benoni / Benko' : n >= 40 ? 'Other queen’s-pawn systems' : n >= 10 ? 'English' : 'Réti / flank openings';
  return 'Other openings';
};

function ingest(pgn, meta) {
  // Some broadcast names contain unescaped quotes and some results have trailing
  // engine comments. Read header lines separately, and validate factual movetext.
  const h=Object.fromEntries([...pgn.matchAll(/^\[(\w+)\s+"(.*)"\]\s*$/gm)].map(m=>[m[1],m[2].replace(/\\"/g,'"')]));
  let c, moves;
  try { c = new Chess(); c.loadPgn(pgn.replace(/^\[.*\]\s*$/gm,'').replace(/\{[^}]*\}/g,' ').replace(/\$\d+/g,''), { strict: false }); moves = c.history(); }
  catch (e) { excluded.push({ source: meta.url || h.GameURL, reason: 'PGN parse failure', detail: e.message }); return; }
  const identity = name => /yunker/i.test(name ?? '') && /alisa/i.test(name ?? '');
  const w = h.WhiteFideId === '55724353' || identity(h.White), b = h.BlackFideId === '55724353' || identity(h.Black);
  if (w === b || h.SetUp === '1' || h.FEN || (h.Variant && h.Variant !== 'Standard') || moves.length < 4) {
    excluded.push({ source: meta.url, reason: 'Ambiguous player, nonstandard position, or fewer than two moves' }); return;
  }
  const side = w ? 'white' : 'black';
  const date = (h.Date ?? '').replaceAll('.', '-');
  const signature = sha([date, side, moves.join(' ')].join('|'));
  if (seen.has(signature)) { excluded.push({ source: meta.url, reason: 'Duplicate game' }); return; }
  seen.add(signature);
  const url = meta.url || h.GameURL || h.Link || h.Site;
  if (!/^https:\/\/(www\.chess\.com|lichess\.org)\//.test(url ?? '')) throw new Error('Missing public game source');
  const event = h.BroadcastName || h.Event || 'Public game';
  const timeClass = meta.timeClass || (/blitz/i.test(event) ? 'blitz' : /rapid/i.test(event) ? 'rapid' : /classical|standard/i.test(event) ? 'classical' : 'unspecified');
  const opening = h.Opening || decodeURIComponent((h.ECOUrl ?? '').split('/openings/')[1] || h.ECO || 'Unclassified opening').replaceAll('-', ' ');
  const eco = h.ECO || '';
  const record = { id: signature.slice(0,16), side, group: family(eco, opening), opening, eco,
    white: h.White, black: h.Black, date, event, source: meta.kind, url, timeClass,
    timeControl: h.TimeControl || '?', result: h.Result || '*', moves: moves.slice(0,40) };
  // Store factual moves only, without third-party commentary, clock or engine annotations.
  const clean = new Chess();
  // chess.js writes values verbatim; normalize decorative quotes in text tags
  // so the exported download can be imported by strict PGN readers.
  for (const [key,value] of Object.entries({Event:event,Site:url,Date:h.Date || '????.??.??',White:h.White,Black:h.Black,Result:h.Result || '*',ECO:eco,Opening:opening,TimeControl:h.TimeControl || '?'})) clean.setHeader(key,value.replaceAll('"',"'"));
  for (const san of moves) clean.move(san);
  games.push({record,pgn:clean.pgn()});
}
for (const file of fs.readdirSync(path.join(input,'broadcasts')).filter(f=>f.endsWith('.pgn')).sort()) {
  const text=fs.readFileSync(path.join(input,'broadcasts',file),'utf8');
  files.push({file:'broadcasts/'+file,sha256:sha(text)});
  for (const pgn of split(text)) ingest(pgn,{kind:'tournament'});
}
for (const file of fs.readdirSync(path.join(input,'chesscom-archives')).filter(f=>f.endsWith('.json')).sort()) {
  const text=fs.readFileSync(path.join(input,'chesscom-archives',file),'utf8');
  files.push({file:'chesscom-archives/'+file,sha256:sha(text)});
  for (const g of JSON.parse(text).games) {
    if(g.rules !== 'chess') { excluded.push({source:g.url,reason:'Nonstandard chess variant'}); continue; }
    ingest(g.pgn,{kind:'online',url:g.url,timeClass:g.time_class});
  }
}
games.sort((a,b)=>b.record.date.localeCompare(a.record.date)||a.record.id.localeCompare(b.record.id));
const records=games.map(g=>g.record);
const counts = field => Object.fromEntries([...new Set(records.map(g=>g[field]))].sort().map(x=>[x,records.filter(g=>g[field]===x).length]));
const manifest={checked:'2026-11-22',games:records.length,bySide:counts('side'),bySource:counts('source'),byTimeClass:counts('timeClass'),excluded,files};
fs.mkdirSync('src/lib/openings/data',{recursive:true}); fs.mkdirSync('public/openings',{recursive:true});
fs.writeFileSync('src/lib/openings/data/yunker-games.json',JSON.stringify(records));
fs.writeFileSync('public/openings/yunker-verified-games.pgn',games.map(g=>g.pgn).join('\n\n'));
fs.writeFileSync(path.join(input,'corpus-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({...manifest,files:files.length,excluded:excluded.length},null,2));

import { Chess } from "chess.js";
import type { OpeningLine } from "./catalog";
import type { OpeningStep } from "./trainer";
import { VERIFIED_GAMES } from "./verified";

export interface GuidedLesson extends OpeningLine { gameId: string; date: string; gameType: string }
const d4 = "Put a pawn in the center. From d4 it controls c5 and e5; your pieces will support this space.";
const c4 = "Challenge Black’s d5 square with the c-pawn. This is the central question behind the Queen’s Gambit.";
const nc3 = "Develop the queenside knight toward the center. On c3 it controls d5 and e4.";
const nf3 = "Develop the kingside knight. It supports d4, controls e5 and brings you closer to castling.";
const e4 = "Build the d4–e4 pawn center. The next job is to support these pawns while developing.";
const c6 = "Prepare …d5 with the c-pawn. Unlike …e6, this leaves a route out for the c8-bishop.";
const d5 = "Challenge White’s center immediately. Watch whether White advances, exchanges or develops a knight.";
const castle = "Put the king behind its pawns and bring the h-rook toward the center.";

function lesson(id: string, title: string, gameId: string, plies: number, plan: string, ownNotes: string[]): GuidedLesson {
  const game = VERIFIED_GAMES.find(g => g.id === gameId);
  if (!game) throw new Error(`Missing source game for ${id}`);
  const moves=game.moves.slice(0,plies), notes: Record<number,string>={};
  const first=game.side === "white" ? 0 : 1;
  if (ownNotes.length !== moves.filter((_,i)=>i%2===first).length) throw new Error(`Missing teaching notes for ${id}`);
  ownNotes.forEach((note,i)=>{notes[i*2+first]=note;});
  return {id:`guided-${id}`,title,subtitle:game.opening,side:game.side,moves,plan,notes,gameId,date:game.date,
    gameType:`${game.source === "tournament" ? "Tournament" : "Online"} · ${game.timeClass === "unspecified" ? "time class unspecified" : game.timeClass}`,
    source:{url:game.url,game:`${game.white} – ${game.black}`,year:Number(game.date.slice(0,4))}};
}

// Original teaching notes about the exact sourced positions. These are not
// quotations, engine verdicts, or claims about the player's private intentions.
export const GUIDED_LESSONS: GuidedLesson[] = [
  lesson("qgd-exchange", "Queen’s Gambit: the Exchange structure", "ce094a45869f1fb1",16,
    "Learn cxd5, then develop the bishops before choosing where your kingside knight belongs. Black’s e-pawn replaces the d-pawn: recognize that structure, not just the move order.",
    [d4,c4,nc3,"Exchange on d5. After …exd5, the central pawn structure is fixed and the c-file is half-open for White.","Pin the f6-knight to the queen on d8. This makes Black’s central defender less flexible.","Place the queen on c2. It supports e4 and helps coordinate a bishop on d3.","Support d4 and open the f1-bishop’s diagonal. The c1-bishop has already escaped the pawn chain.","Develop the bishop to d3, facing h7. Complete development before launching a pawn attack."]),
  lesson("qgd-nge2", "Queen’s Gambit: keep the f-pawn free", "1b5af29fe699bba8",16,
    "Compare this Exchange game with the previous lesson. Nge2 leaves f3 available to support a later e4 break; it is a specific option, not a move to play in every position.",
    [d4,c4,nc3,"Exchange the c-pawn for Black’s d-pawn and recognize the same pawn structure.","Develop the bishop actively before playing e3.","Open the f1-bishop’s diagonal and reinforce d4.","Aim the bishop toward h7 while clearing f1 for castling.","Use e2 for this knight. Unlike Nf3, it leaves the f-pawn free for a possible f3–e4 plan."]),
  lesson("white-slav", "Exchange Slav: develop outside the pawn chain", "251a08311c760632",16,
    "The English move order transposes into an Exchange Slav. The center is symmetrical, so active pieces and control of the c-file matter.",
    ["Start with c4, controlling d5 from the flank. The next d4 will bring this game into a Slav structure.",d4,"Exchange on d5; Black’s c-pawn recaptures, opening the c-file.",nc3,"Develop the c1-bishop before e3 blocks its diagonal. On f4 it watches e5 and d6.","Support d4 and release the f1-bishop, with your other bishop already active.",nf3,"Put a rook on the open c-file. Black’s knight on c6 is a possible target along that file."]),
  lesson("qga", "Queen’s Gambit Accepted: recover the pawn", "8b004f8767c7a090",16,
    "Black captures on c4. Recover that pawn through development, then notice the isolated d-pawn that arises in this particular game.",
    [d4,c4,"Open the f1-bishop’s route to c4 so it can recover the pawn.","Recover the c4-pawn with the bishop. You develop a piece while restoring the material balance.","Recapture on d4. With no c- or e-pawn beside it, this is an isolated d-pawn: piece activity becomes especially important.",nf3,castle,nc3]),
  lesson("english", "English: four knights and queenside space", "80c44f4b1b187722",16,
    "Learn a real c4 branch from her tournament games. Develop both knights, establish e4, then watch how a3 and b4 gain space with tempo against the bishop.",
    ["Control d5 with c4 while keeping the d-pawn flexible.",nc3,nf3,"Establish a pawn on e4. Together with c4 it controls d5, but leaves d4 available to Black’s pieces.","Support e4 and open the c1-bishop’s diagonal.","Ask the bishop on b4 to decide. In this game it retreats to a5.","Gain queenside space and attack the bishop on a5 with the b-pawn. This sequence depends on where that bishop stands.","Develop the bishop to e3. Your next priorities are the remaining bishop and king safety."]),
  lesson("nimzo", "Nimzo-Indian: Qc2 and the bishop pin", "01eaeda437090ede",16,
    "Black pins your c3-knight with …Bb4. Qc2 prepares a queen recapture on c3, avoiding doubled c-pawns if Black exchanges.",
    [d4,c4,nc3,"Support the c3-knight with the queen. If …Bxc3 happens, Qxc3 can preserve your pawn structure.","Develop the bishop to g5 and put pressure on the f6-knight.","Support d4 and release the f1-bishop.",nf3,"Retreat the bishop after …h6 attacks it. Bh4 keeps the bishop on the h4–d8 diagonal."]),
  lesson("kid-bd3", "King’s Indian: the Bd3 setup", "432ea8d917f5d78d",16,
    "Build a broad center, develop, and meet …c5 with d5 in this game. Do not confuse this Bd3 setup with the Four Pawns or Sämisch branches.",
    [d4,c4,nc3,e4,nf3,"Support e4 with the bishop on d3 and clear f1 for castling.","Advance past Black’s c5-pawn. The center closes, so identify the pawn breaks before starting an attack.","Control g4, reducing the scope for a black bishop or knight to arrive there. This is a preparation move, not development."]),
  lesson("samisch", "King’s Indian: the Sämisch with f3", "478f90b79f0952c6",16,
    "Here f3 supports the e4-pawn. It also takes f3 away from your knight, so the rest of your development must fit that choice.",
    [d4,c4,nc3,e4,"Support e4 with f3. Notice the tradeoff: your g1-knight now needs another development square.","Develop the bishop to e3, supporting d4 while keeping castling options open.","Bring the other bishop to d3, adding another defender to e4.","Recapture on d4 with the bishop after …cxd4. Recognize the changed center before deciding where the king belongs."]),
  lesson("four-pawns", "Four Pawns: the Benoni transition", "77d5326ce137eb3b",17,
    "The center starts with four pawns on c4, d4, e4 and f4. Black’s …c5 and …e6 then transform it into a Benoni structure.",
    [d4,c4,nc3,e4,"Take more space with f4. The large pawn center needs piece support; delaying development can make it a target.",nf3,"Meet …c5 by advancing d5, closing the center and gaining space.","Develop the bishop and prepare to castle. Black is already challenging the center with …e6.","Recapture on d5 with the c-pawn. This preserves the advanced d5-pawn and opens the c-file for White."]),
  lesson("white-grunfeld", "Grünfeld: build and defend the big center", "4339412091f88fb2",16,
    "Black challenges the center early with …d5. White accepts a large center, but must prepare for pressure from …Bg7 and …c5.",
    [d4,c4,nc3,"Exchange on d5. Black recaptures with the knight, drawing it into the center.","Advance e4 with an attack on the d5-knight.","Recapture on c3 with the b-pawn. This supports d4, although your queenside pawn structure has changed.","Develop the bishop to e3 and reinforce the d4-pawn.","Connect the queen with the bishop on e3. Black’s next …c5 challenges the center directly."]),
  lesson("caro-advance", "Caro-Kann Advance: bishop out, then …c5", "472bfb435b40ccb7",16,
    "Against e5, get the light-squared bishop outside the pawn chain before …e6. Then attack the base of White’s chain on d4.",
    [c6,d5,"Develop the c8-bishop before …e6 would block it in.","Support d5 and release the f8-bishop; your light-squared bishop is already outside the chain.","Challenge d4, the base of White’s e5–d4 pawn chain.","Develop the knight to c6, adding pressure to d4.","Place the rook on c8 behind the c-pawn, anticipating that the c-file may open.","Exchange on d4. Watch which white pawn recaptures and reassess the center."]),
  lesson("caro-c5", "Caro-Kann Advance: the immediate …c5", "07d5e5a05e204abf",16,
    "This separate recorded branch uses …c5 before developing the bishop. Learn the actual recovery of the pawn rather than mixing it with the …Bf5 move order.",
    [c6,d5,"Strike at d4 immediately. This uses a second tempo on the c-pawn, so development must stay purposeful.","After dxc5, open the f8-bishop and prepare to recover the c5-pawn with a piece.","Develop the knight to d7, from where it can recapture on c5.","Recover the pawn on c5 with the knight.","Develop the other knight to e7, keeping the f-pawn free and clearing g8 for castling.","Exchange the c5-knight for the bishop on d3. White can recapture with the queen; this changes the minor-piece balance."]),
  lesson("caro-tal", "Caro-Kann: meet the h-pawn advance", "b950f656c51b3c84",10,
    "White uses h4 against the bishop on f5. This short lesson isolates the …h5 and bishop-exchange response before the game’s sharper queen play.",
    [c6,d5,"Develop the light-squared bishop before closing the center with …e6.","Stop White from advancing h5 immediately. This is a response to h4 in this position, not an automatic Caro-Kann move.","Exchange bishops on d3. White’s queen will recapture, so keep an eye on both development and queen activity."]),
  lesson("caro-exchange", "Caro-Kann Exchange: active bishop development", "1e55956d9c45335a",16,
    "White exchanges on d5 and develops the bishop to d3. Learn to activate the light-squared bishop before playing …e6.",
    [c6,d5,"Recapture with the c-pawn and keep a pawn on d5.","Develop the knight to c6, adding central pressure.","Develop the kingside knight and control e4.","Develop the bishop to g4 with an attack along the diagonal toward White’s queen on d1. White’s knight is still on g1.","Defend b7 and d5 with the queen on d7 after White’s queen comes to b3.","Support d5 and open the dark-squared bishop’s diagonal. The light-squared bishop has already developed."]),
  lesson("caro-panov", "Caro-Kann Panov: the fianchetto branch", "e131e56b5ff66753",16,
    "White adds c4 to challenge d5. In this sourced game Black develops the bishop on g7; keep this branch separate from setups with …e6 and …Be7.",
    [c6,d5,"Recapture on d5 with the c-pawn.","Develop the knight, defending d5 before White increases the pressure.","Prepare …Bg7. The bishop will contest the long diagonal and help pressure the center.","Place the bishop on g7. Notice how White’s d4-pawn lies on its long diagonal, with pieces potentially blocking the line.",castle,"Develop the queenside knight toward d4 and e5. All your minor pieces now have active roles except the c8-bishop."]),
  lesson("caro-tartakower", "Caro-Kann Tartakower: use the open e-file", "bda77a87ae7c5b8b",16,
    "Challenge the knight on e4 with …Nf6. After Nxf6+, the e-pawn recaptures: doubled f-pawns are the price for development and an open e-file.",
    [c6,d5,"Exchange on e4 and invite the white knight into the center.","Attack the e4-knight with your developing knight.","Recapture with the e-pawn, accepting doubled f-pawns. The e-file is now open.","Develop the bishop to d6, looking toward h2 and clearing the way to castle.",castle,"Put the rook on the open e-file. This is the activity that justifies the unusual pawn structure."]),
  lesson("caro-two-knights", "Caro-Kann: the Two Knights and Qe2", "a62323d6eee3e3ca",16,
    "White develops both knights before moving the d-pawn. Follow this specific Qe2 branch, including the queen moves after the central knights are exchanged.",
    [c6,d5,"Take on e4; White’s c3-knight recaptures.","Develop with an attack on the e4-knight.","Exchange knights on e4 after Qe2. White’s queen becomes centralized when it recaptures.","Bring the queen to a5. Watch White’s b-pawn: it can attack the queen with tempo.","Move the queen to d5 after b4 attacks it. The c6-pawn supports the d5-square.","Retreat to d6, keeping the queens on the board. After these queen moves, finishing minor-piece development is urgent."]),
  lesson("black-slav-exchange", "Slav Exchange: answer Qb3 and Qa4+", "8ee8fc05f051387f",16,
    "Develop outside the pawn chain, then learn the concrete response to White’s queen pressure. …Na5 attacks Qb3; …Bd7 answers the resulting check.",
    ["Occupy d5, controlling c4 and e4.","Develop the knight to f6 and support the d5-pawn.","Support d5 with c6 while keeping the c8-bishop’s diagonal available.","Recapture on d5 with the c-pawn. The c-file opens.","Develop the queenside knight toward the center.","Get the bishop to f5 before …e6 would block its diagonal.","Attack the queen on b3 with …Na5. Remember that moving the knight also clears c6.","Block the a4–e8 diagonal after Qa4+ by putting the bishop on d7."]),
  lesson("black-slav-main", "Slav: take on c4 and develop actively", "43928a180a2fcd5d",16,
    "Black captures on c4 after both sides develop knights. This game uses …a5 and …Bg4; learn their timing instead of assuming every Slav uses …Bf5.",
    ["Occupy d5 and contest the center.","Support d5 with c6 while keeping the light-squared bishop free.","Develop the knight to f6 and defend d5.","Capture the c4-pawn. White will work to recover it while building the center.","Meet a4 with …a5, controlling b4 and fixing queenside space.","Pin the f3-knight toward the queen on d1. This develops the light-squared bishop before …e6.","Open the f8-bishop’s diagonal and support the center.","Develop the bishop to b4, pinning the c3-knight to the king on e1."]),
  lesson("black-fianchetto", "Slav move order: the …g6 branch", "f22ffb3f7988838c",16,
    "This recorded …c6/…d5 move order adds a kingside fianchetto. It is one branch to understand, not a replacement for all the Slav positions.",
    ["Keep …d5 available with c6; White has not yet committed the c-pawn.","Establish the supported d5 center.","Develop the knight to f6 and defend d5.","Prepare the bishop’s development to g7.","Develop the bishop on the long diagonal.",castle,"Develop the c8-bishop actively to g4, putting pressure on the f3-knight.","Recapture on d5 with the c-pawn after White exchanges. Notice the now-open c-file."]),
  lesson("black-english", "Against c4: the recorded …d5/…c6 gambit", "8bdbcb42e1762a9c",16,
    "This is a pawn-sacrifice branch from one tournament game. Black uses rapid development after …c6 and Nxc6; do not mistake it for a pawn-equal, quiet Slav setup.",
    ["Develop the knight to f6, contesting e4 and d5.","Challenge White’s c4-pawn directly with …d5.","Offer the c-pawn after cxd5. This game accepts a pawn deficit to accelerate development.","Recapture on c6 with the knight. Black has developed quickly but remains a pawn down.","Develop the c8-bishop outside the pawn chain.","Use the open c-file for the rook, now that both the knight and bishop have left its path.","Open the dark-squared bishop’s diagonal and support d5.","Develop the bishop to c5, looking along the diagonal toward f2. King safety is the next priority."]),
];

export const DAY_LESSONS = [
  ["qgd-exchange","qgd-nge2","white-slav","qga"],
  ["english","nimzo","kid-bd3","samisch","four-pawns","white-grunfeld"],
  ["caro-advance","caro-c5","caro-tal","caro-exchange","caro-panov","caro-tartakower","caro-two-knights"],
  ["black-slav-exchange","black-slav-main","black-fianchetto","black-english"],
  ["qgd-exchange","english","nimzo","kid-bd3","caro-advance","caro-panov","caro-tartakower","black-slav-main"],
].map(ids=>ids.map(id=>GUIDED_LESSONS.find(l=>l.id===`guided-${id}`)!));

const pieces: Record<string,string>={p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
export function stepExplanation(lesson: GuidedLesson, step: OpeningStep, index: number): string {
  if (lesson.notes[index]) return lesson.notes[index];
  const chess=new Chess(step.fen), move=chess.move(step.san);
  const side=step.side === "white" ? "White" : "Black";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return `${side} castles, moving the king to safety and bringing a rook toward the center.`;
  if (move.captured) return `${side} captures your ${pieces[move.captured]} on ${move.to} with the ${pieces[move.piece]}.${move.san.includes("+")?" This is check: the king must be made safe.":" Notice what this exchange changes in the center and in the open lines."}`;
  if (move.piece === "p") return `${side} advances the ${move.from[0]}-pawn to ${move.to}. Check which central squares and pawn breaks this changes before choosing your reply.`;
  return `${side} moves the ${pieces[move.piece]} from ${move.from} to ${move.to}.${move.san.includes("+")?" This gives check: your reply must deal with it.":" Notice its new attacks before continuing the line."}`;
}

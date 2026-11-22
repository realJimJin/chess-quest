import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { DAY_LESSONS, GUIDED_LESSONS, stepExplanation } from "./lessons";
import { compileLine } from "./trainer";
import { VERIFIED_GAMES } from "./verified";

describe("guided opening curriculum",()=>{
  it("has playable lessons for every day and both colors in the final review",()=>{
    expect(DAY_LESSONS).toHaveLength(5);
    expect(GUIDED_LESSONS).toHaveLength(21);
    for(const day of DAY_LESSONS)expect(day.length).toBeGreaterThan(0);
    expect(new Set(DAY_LESSONS[4].map(l=>l.side))).toEqual(new Set(["white","black"]));
  });
  it("uses exact source moves and explains every move the learner plays",()=>{
    for(const lesson of GUIDED_LESSONS){
      const source=VERIFIED_GAMES.find(g=>g.id===lesson.gameId)!;
      expect(lesson.moves).toEqual(source.moves.slice(0,lesson.moves.length));
      expect(lesson.side).toBe(source.side);
      expect(lesson.source.url).toBe(source.url);
      const steps=compileLine(lesson);
      steps.forEach((step,i)=>{
        if(step.side===lesson.side)expect(lesson.notes[i]?.length,`${lesson.id}, ${step.san}`).toBeGreaterThan(15);
        expect(stepExplanation(lesson,step,i).length).toBeGreaterThan(15);
      });
    }
  });
  it("checks the concrete teaching claims about the bishop attack and pawn sacrifice",()=>{
    const exchange=compileLine(GUIDED_LESSONS.find(l=>l.id==="guided-caro-exchange")!);
    const afterBg4=new Chess(exchange[11].after);
    expect(afterBg4.get("d1")?.type).toBe("q");
    expect(afterBg4.isAttacked("d1","b")).toBe(true);
    expect(afterBg4.get("g1")?.type).toBe("n");
    const gambit=compileLine(GUIDED_LESSONS.find(l=>l.id==="guided-black-english")!);
    const board=new Chess(gambit[7].after).board().flat();
    expect(board.filter(p=>p?.type==="p"&&p.color==="w").length-board.filter(p=>p?.type==="p"&&p.color==="b").length).toBe(1);
  });
});

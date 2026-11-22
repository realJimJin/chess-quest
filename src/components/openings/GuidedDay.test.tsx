// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import GuidedDay from "./GuidedDay";
import { DAY_LESSONS } from "@/lib/openings/lessons";
import { compileLine } from "@/lib/openings/trainer";
import { emptyOpeningProgress, type OpeningProgress } from "@/lib/openings/progress";
import type { MoveInput } from "@/lib/puzzle";

vi.mock("@/components/Board",()=>({default:({fen,orientation,interactive,onMove,arrows}:{fen:string;orientation:string;interactive:boolean;onMove:(m:MoveInput)=>void;arrows:unknown})=><div data-testid="board" data-fen={fen} data-orientation={orientation} data-arrows={JSON.stringify(arrows)}>{interactive&&new Chess(fen).moves({verbose:true}).map(m=><button key={m.lan} onClick={()=>onMove(m)}>Board {m.san}</button>)}</div>}));
beforeEach(()=>{HTMLElement.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{cleanup();vi.useRealTimers();});
function store(){let value:OpeningProgress=emptyOpeningProgress();return {load:vi.fn(()=>value),save:vi.fn((p:OpeningProgress)=>{value=p;})};}

it("shows a move, its arrow and explanation, then recalls the full line and saves an honest score",async()=>{
  const progress=store();
  render(<GuidedDay day={0} onExit={()=>{}} progressStore={progress}/>);
  await userEvent.click(screen.getByTestId("show-next-move"));
  expect(screen.getByTestId("board").getAttribute("data-arrows")).toBe('[{"from":"d2","to":"d4"}]');
  expect(screen.getByTestId("lesson-explanation").textContent).toContain("controls c5 and e5");
  expect(progress.save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button",{name:"2. Practice this line"}));
  await userEvent.click(screen.getByRole("button",{name:"Board h4"}));
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(new Chess().fen());
  expect(screen.getByRole("status").textContent).toContain("different move");
  await userEvent.click(screen.getByRole("button",{name:"Show me the move"}));
  expect(screen.getByTestId("board").getAttribute("data-arrows")).toContain('"to":"d4"');
  for(const step of compileLine(DAY_LESSONS[0][0]).filter(s=>s.side==="white")){
    await waitFor(()=>expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(step.fen));
    await userEvent.click(screen.getByRole("button",{name:`Board ${step.san}`}));
  }
  await screen.findByText("Practice complete");
  await waitFor(()=>expect(progress.save).toHaveBeenCalledTimes(1));
  expect(progress.load().lines[DAY_LESSONS[0][0].id].accuracy).toBe(88);
  fireEvent.keyDown(window,{key:"ArrowLeft"});
  expect(screen.getByText(/Review ·/)).toBeTruthy();
  expect(screen.queryAllByRole("button",{name:/^Board /})).toHaveLength(0);
  fireEvent.keyDown(window,{key:"ArrowRight"});
  expect(screen.getByText("Practice complete")).toBeTruthy();
  expect(progress.save).toHaveBeenCalledTimes(1);
  expect(progress.load().lines[DAY_LESSONS[0][0].id].accuracy).toBe(88);
  await userEvent.click(screen.getByRole("button",{name:"Next lesson →"}));
  expect(screen.getByRole("heading",{level:2}).textContent).toContain("keep the f-pawn free");
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("0");
},15000);

it("pauses the demonstration and cancels it when switching lessons",async()=>{
  vi.useFakeTimers();
  render(<GuidedDay day={1} onExit={()=>{}} progressStore={store()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Play demonstration"}));
  await act(async()=>{vi.advanceTimersByTime(2600);});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("1");
  fireEvent.click(screen.getByRole("button",{name:"Pause demonstration"}));
  await act(async()=>{vi.advanceTimersByTime(5200);});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("1");
  fireEvent.click(screen.getByRole("button",{name:"Play demonstration"}));
  fireEvent.change(screen.getByLabelText("Choose lesson"),{target:{value:"1"}});
  await act(async()=>{vi.advanceTimersByTime(5200);});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("0");
  expect(screen.getByRole("heading",{level:2}).textContent).toContain("Nimzo-Indian");
});

it("steps through the demonstration with arrow keys, bounds navigation and pauses playback",async()=>{
  vi.useFakeTimers();
  const progress=store();
  const steps=compileLine(DAY_LESSONS[0][0]);
  render(<GuidedDay day={0} onExit={()=>{}} progressStore={progress}/>);
  const button=screen.getByTestId("show-next-move");
  button.focus();
  fireEvent.keyDown(button,{key:"ArrowLeft"});
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(new Chess().fen());
  fireEvent.keyDown(button,{key:"ArrowRight"});
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(steps[0].after);
  expect(screen.getByTestId("lesson-explanation").textContent).toContain("controls c5 and e5");
  fireEvent.click(screen.getByRole("button",{name:"Play demonstration"}));
  fireEvent.keyDown(window,{key:"ArrowLeft"});
  await act(async()=>{vi.advanceTimersByTime(5200);});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("0");
  expect(screen.getByRole("button",{name:"Play demonstration"})).toBeTruthy();
  for(let i=0;i<steps.length+2;i++)fireEvent.keyDown(window,{key:"ArrowRight"});
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(steps.at(-1)!.after);
  for(let i=0;i<steps.length+2;i++)fireEvent.keyDown(window,{key:"ArrowLeft"});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("0");
  expect(progress.save).not.toHaveBeenCalled();
});

it("reviews practice history without skipping unplayed moves, and pauses the opponent until returning",async()=>{
  vi.useFakeTimers();
  render(<GuidedDay day={0} onExit={()=>{}} progressStore={store()}/>);
  fireEvent.click(screen.getByRole("button",{name:"2. Practice this line"}));
  fireEvent.keyDown(window,{key:"ArrowRight"});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("0");
  fireEvent.click(screen.getByRole("button",{name:"Board d4"}));
  fireEvent.keyDown(window,{key:"ArrowLeft"});
  await act(async()=>{vi.advanceTimersByTime(1100);});
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(new Chess().fen());
  expect(screen.queryAllByRole("button",{name:/^Board /})).toHaveLength(0);
  expect(screen.getByRole("button",{name:"Return to practice →"})).toBeTruthy();
  fireEvent.keyDown(window,{key:"ArrowRight"});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("1");
  await act(async()=>{vi.advanceTimersByTime(550);});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("2");
  fireEvent.keyDown(window,{key:"ArrowRight"});
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("2");
  fireEvent.keyDown(window,{key:"ArrowLeft"});
  fireEvent.click(screen.getByRole("button",{name:"Return to practice →"}));
  expect(screen.getByRole("button",{name:"Board c4"})).toBeTruthy();
});

it("leaves text fields, lesson selectors, and modified shortcuts alone",()=>{
  render(<GuidedDay day={0} onExit={()=>{}} progressStore={store()}/>);
  for(const modifier of ["altKey","ctrlKey","metaKey","shiftKey","isComposing"]){
    fireEvent.keyDown(window,{key:"ArrowRight",[modifier]:true});
  }
  const select=screen.getByLabelText("Choose lesson");
  expect(fireEvent.keyDown(select,{key:"ArrowRight"})).toBe(true);
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("0");
  fireEvent.click(screen.getByRole("button",{name:"2. Practice this line"}));
  fireEvent.click(screen.getByRole("button",{name:"Board d4"}));
  const input=screen.getByLabelText("Move squares");
  expect(fireEvent.keyDown(input,{key:"ArrowLeft"})).toBe(true);
  expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("1");
});

it("starts Black correctly in practice and allows a keyboard move",async()=>{
  render(<GuidedDay day={2} onExit={()=>{}} progressStore={store()}/>);
  expect(screen.getByTestId("board").getAttribute("data-orientation")).toBe("black");
  await userEvent.click(screen.getByRole("button",{name:"2. Practice this line"}));
  await screen.findByRole("button",{name:"Board c6"});
  await userEvent.click(screen.getByText("Enter a move using squares"));
  await userEvent.type(screen.getByLabelText("Move squares"),"c7 c6");
  await userEvent.click(screen.getByRole("button",{name:"Play move"}));
  await waitFor(()=>expect(screen.getByTestId("guided-session").getAttribute("data-ply")).toBe("3"));
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(compileLine(DAY_LESSONS[2][0])[2].after);
});

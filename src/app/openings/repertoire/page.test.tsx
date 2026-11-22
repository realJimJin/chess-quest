// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import Openings from "./page";
import { STUDY_DAYS } from "@/lib/openings/verified";
import type { MoveInput } from "@/lib/puzzle";
vi.mock("idb-keyval",()=>({get:vi.fn(async()=>undefined),set:vi.fn(async()=>{}),del:vi.fn(async()=>{})}));
vi.mock("@/components/Board",()=>({default:({fen,orientation,interactive,onMove}:{fen:string;orientation:string;interactive:boolean;onMove:(m:MoveInput)=>void})=><div data-testid="board" data-fen={fen} data-orientation={orientation}>{interactive&&new Chess(fen).moves({verbose:true}).map(m=><button key={m.lan} onClick={()=>onMove(m)}>Board {m.san}</button>)}</div>}));
beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});vi.spyOn(Math,"random").mockReturnValue(0);HTMLElement.prototype.scrollIntoView=vi.fn();window.scrollTo=vi.fn();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

for(let day=1;day<=5;day++)it(`Train day ${day} opens a visible, focused board lesson`,async()=>{
  render(<Openings/>);
  await userEvent.click(screen.getByRole("button",{name:`Train day ${day}`}));
  const heading=screen.getByRole("heading",{level:1,name:STUDY_DAYS[day-1].title});
  expect(document.activeElement).toBe(heading);
  expect(heading.scrollIntoView).toHaveBeenCalled();
  expect(screen.getByRole("region",{name:"Guided opening lesson"})).toBeTruthy();
  expect(screen.getByTestId("board")).toBeTruthy();
  expect(screen.queryByLabelText("Game sources")).toBeNull();
  expect(screen.getByTestId("guided-session").getAttribute("data-mode")).toBe(day===5?"recall":"learn");
  if(day<5){
    const before=screen.getByTestId("board").getAttribute("data-fen");
    await userEvent.click(screen.getByTestId("show-next-move"));
    expect(screen.getByTestId("board").getAttribute("data-fen")).not.toBe(before);
  }
  await userEvent.click(screen.getByRole("button",{name:/All days & variations/}));
  expect(screen.getByRole("button",{name:"Train day 1"})).toBeTruthy();
});

it("explores real alternatives without grading and links the source game",async()=>{
  render(<Openings/>);
  await waitFor(()=>expect(screen.getByTestId("sample-coverage").textContent).toMatch(/games as white/));
  await userEvent.click(screen.getByRole("button",{name:"Board d4"}));
  const replies=screen.getByRole("group",{name:"Recorded moves"});
  expect(within(replies).getAllByRole("button").length).toBeGreaterThan(1);
  await userEvent.click(within(replies).getAllByRole("button")[0]);
  expect(screen.getByTestId("moves").textContent).toMatch(/^1. d4 /);
  expect(screen.getByText("Source games for the last move")).toBeTruthy();
  expect(screen.getByTestId("coverage").textContent).toContain("0 of");
});

it("filters Black Caro-Kann variations, keeps unrecorded moves on the board, and recalls automatically",async()=>{
  render(<Openings/>);
  await userEvent.click(screen.getByTestId("side-black"));
  expect(screen.getByTestId("board").getAttribute("data-orientation")).toBe("black");
  await userEvent.click(screen.getByTestId("group-Caro-Kann"));
  expect(screen.getByLabelText("Specific variation").querySelectorAll("option").length).toBeGreaterThan(4);
  await userEvent.click(screen.getByRole("button",{name:"Recall without hints"}));
  await screen.findByRole("button",{name:"Board c6"});
  const fen=screen.getByTestId("board").getAttribute("data-fen");
  await userEvent.click(screen.getByRole("button",{name:"Board h6"}));
  expect(screen.getByTestId("board").getAttribute("data-fen")).toBe(fen);
  expect(screen.getByTestId("feedback").textContent).toContain("does not make it a bad chess move");
  await userEvent.click(screen.getByRole("button",{name:"Board c6"}));
  await waitFor(()=>expect(screen.getByTestId("moves").textContent).toMatch(/1. e4 c6 2\./));
  await userEvent.selectOptions(screen.getByLabelText("Specific variation"),screen.getByLabelText("Specific variation").querySelectorAll("option")[1].value);
  await waitFor(()=>expect(screen.getByTestId("moves").textContent).toMatch(/^—$|^1\. e4$/));
});

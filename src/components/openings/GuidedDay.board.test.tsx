// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GuidedDay from "./GuidedDay";
import { emptyOpeningProgress } from "@/lib/openings/progress";

beforeEach(()=>{
  HTMLElement.prototype.scrollIntoView=vi.fn();
  vi.stubGlobal("ResizeObserver",class {observe(){} unobserve(){} disconnect(){}});
  window.matchMedia=vi.fn().mockReturnValue({matches:true,addListener:vi.fn(),removeListener:vi.fn()});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it("updates the actual chessboard and draws a move arrow when Show is tapped",async()=>{
  const {container}=render(<GuidedDay day={0} onExit={()=>{}} progressStore={{load:emptyOpeningProgress,save:()=>{}}}/>);
  expect(container.querySelector("cg-board")).toBeTruthy();
  expect(container.querySelectorAll("cg-board piece").length).toBe(32);
  const before=screen.getByTestId("board").getAttribute("data-fen");
  await userEvent.click(screen.getByTestId("show-next-move"));
  expect(screen.getByTestId("board").getAttribute("data-fen")).not.toBe(before);
  await waitFor(()=>expect(container.querySelectorAll("cg-board square.last-move").length).toBe(2));
  await waitFor(()=>expect(container.querySelector("svg.cg-shapes line")).toBeTruthy());
});

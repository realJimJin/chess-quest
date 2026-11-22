import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { parseNotation } from "../notation";

describe("keyboard move entry", () => {
  const initial = new Chess().fen();
  it("accepts algebraic and coordinate notation without changing the position", () => {
    expect(parseNotation(initial, "Nf3")).toEqual({ from: "g1", to: "f3" });
    expect(parseNotation(initial, "e2e4")).toEqual({ from: "e2", to: "e4" });
    expect(new Chess(initial).turn()).toBe("w");
  });
  it("accepts an optional move number and whitespace", () => {
    expect(parseNotation(initial, " 1. Nf3 ")).toEqual({ from: "g1", to: "f3" });
    const black = new Chess(); black.move("e4");
    expect(parseNotation(black.fen(), "1... e5")).toEqual({ from: "e7", to: "e5" });
  });
  it("rejects moves for the wrong side, illegal moves, and empty input", () => {
    for (const move of ["e5", "e2e5", "", " ", "not a move"]) expect(parseNotation(initial, move)).toBeNull();
  });
  it("preserves a chosen underpromotion", () => {
    expect(parseNotation("7k/P7/8/8/8/8/8/K7 w - - 0 1", "a8=N")).toEqual({ from: "a7", to: "a8", promotion: "n" });
  });
  it("supports legal castling", () => {
    expect(parseNotation("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "O-O")).toEqual({ from: "e1", to: "g1" });
  });
  it("rejects moves that leave the king in check", () => {
    expect(parseNotation("4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1", "Ra2")).toBeNull();
  });
  it("handles an unavailable or invalid position without throwing", () => {
    expect(parseNotation("invalid", "Nf3")).toBeNull();
  });
});

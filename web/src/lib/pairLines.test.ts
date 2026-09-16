import { describe, it, expect } from "vitest";
import { pairHunkLines } from "./pairLines";
import type { DiffLine } from "../types";

function line(type: DiffLine["type"], oldLineNumber: number | null, newLineNumber: number | null, content: string): DiffLine {
  return { type, oldLineNumber, newLineNumber, content };
}

describe("pairHunkLines", () => {
  it("pairs context lines with themselves on both sides", () => {
    const lines = [line("context", 1, 1, "one")];
    expect(pairHunkLines(lines)).toEqual([{ old: lines[0], new: lines[0] }]);
  });

  it("pairs a balanced del/add run 1:1 in order", () => {
    const del = line("del", 2, null, "old two");
    const add = line("add", null, 2, "new two");
    expect(pairHunkLines([del, add])).toEqual([{ old: del, new: add }]);
  });

  it("pads the shorter side with null when del/add counts differ", () => {
    const del1 = line("del", 2, null, "a");
    const del2 = line("del", 3, null, "b");
    const del3 = line("del", 4, null, "c");
    const add1 = line("add", null, 2, "x");
    const rows = pairHunkLines([del1, del2, del3, add1]);
    expect(rows).toEqual([
      { old: del1, new: add1 },
      { old: del2, new: null },
      { old: del3, new: null },
    ]);
  });

  it("handles an add-only run with no preceding dels", () => {
    const add = line("add", null, 5, "new line");
    expect(pairHunkLines([add])).toEqual([{ old: null, new: add }]);
  });

  it("interleaves context and change runs correctly", () => {
    const ctx = line("context", 1, 1, "same");
    const del = line("del", 2, null, "old");
    const add = line("add", null, 2, "new");
    const ctx2 = line("context", 3, 3, "same2");
    expect(pairHunkLines([ctx, del, add, ctx2])).toEqual([
      { old: ctx, new: ctx },
      { old: del, new: add },
      { old: ctx2, new: ctx2 },
    ]);
  });
});

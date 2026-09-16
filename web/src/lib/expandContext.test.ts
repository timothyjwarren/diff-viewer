import { describe, it, expect } from "vitest";
import { expandHunkContext } from "./expandContext";
import type { DiffHunk } from "../types";

const fullFile = ["one", "two", "three", "four", "five", "six", "seven"];

const hunk: DiffHunk = {
  oldStart: 4, oldLines: 1, newStart: 4, newLines: 1,
  lines: [{ type: "context", oldLineNumber: 4, newLineNumber: 4, content: "four" }],
};

describe("expandHunkContext", () => {
  it("prepends lines above the hunk when expanding up", () => {
    const result = expandHunkContext([hunk], fullFile, 0, "up");
    const contents = result[0].lines.map(l => l.content);
    expect(contents.slice(0, 3)).toEqual(["one", "two", "three"]);
    expect(result[0].oldStart).toBe(1);
  });

  it("appends lines below the hunk when expanding down", () => {
    const result = expandHunkContext([hunk], fullFile, 0, "down");
    const contents = result[0].lines.map(l => l.content);
    expect(contents.slice(-3)).toEqual(["five", "six", "seven"]);
  });
});

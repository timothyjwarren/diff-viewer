import { describe, it, expect } from "vitest";
import { expandHunkContext, hiddenLinesBefore, hiddenLinesAfter, findGapExpansionForLine } from "./expandContext";
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

  it("respects a custom amount instead of the default chunk size", () => {
    const result = expandHunkContext([hunk], fullFile, 0, "up", 1);
    const contents = result[0].lines.map(l => l.content);
    expect(contents.slice(0, 2)).toEqual(["three", "four"]);
  });
});

describe("hiddenLinesBefore", () => {
  it("counts lines between the file start and the first hunk", () => {
    expect(hiddenLinesBefore([hunk], 0)).toBe(3);
  });

  it("counts lines between two adjacent hunks", () => {
    const second: DiffHunk = {
      oldStart: 7, oldLines: 1, newStart: 7, newLines: 1,
      lines: [{ type: "context", oldLineNumber: 7, newLineNumber: 7, content: "seven" }],
    };
    expect(hiddenLinesBefore([hunk, second], 1)).toBe(2);
  });

  it("is zero when hunks are already contiguous", () => {
    const second: DiffHunk = {
      oldStart: 5, oldLines: 1, newStart: 5, newLines: 1,
      lines: [{ type: "context", oldLineNumber: 5, newLineNumber: 5, content: "five" }],
    };
    expect(hiddenLinesBefore([hunk, second], 1)).toBe(0);
  });
});

describe("hiddenLinesAfter", () => {
  it("counts lines between a hunk and the next hunk without needing the full file", () => {
    const second: DiffHunk = {
      oldStart: 7, oldLines: 1, newStart: 7, newLines: 1,
      lines: [{ type: "context", oldLineNumber: 7, newLineNumber: 7, content: "seven" }],
    };
    expect(hiddenLinesAfter([hunk, second], 0, null)).toBe(2);
  });

  it("returns null for the last hunk when the full file line count is unknown", () => {
    expect(hiddenLinesAfter([hunk], 0, null)).toBeNull();
  });

  it("counts lines between the last hunk and the end of the file once known", () => {
    expect(hiddenLinesAfter([hunk], 0, fullFile.length)).toBe(3);
  });
});

describe("findGapExpansionForLine", () => {
  it("returns null when the line is already visible inside a hunk", () => {
    expect(findGapExpansionForLine([hunk], 4)).toBeNull();
  });

  it("returns null when there are no hunks", () => {
    expect(findGapExpansionForLine([], 4)).toBeNull();
  });

  it("expands the first hunk upward when the line is hidden before it", () => {
    expect(findGapExpansionForLine([hunk], 2)).toEqual({ hunkIndex: 0, direction: "up", amount: 2 });
  });

  it("expands the earlier hunk downward when the line is hidden between two hunks", () => {
    const second: DiffHunk = {
      oldStart: 7, oldLines: 1, newStart: 7, newLines: 1,
      lines: [{ type: "context", oldLineNumber: 7, newLineNumber: 7, content: "seven" }],
    };
    expect(findGapExpansionForLine([hunk, second], 6)).toEqual({ hunkIndex: 0, direction: "down", amount: 2 });
  });

  it("expands the last hunk downward when the line is hidden after it", () => {
    expect(findGapExpansionForLine([hunk], 6)).toEqual({ hunkIndex: 0, direction: "down", amount: 2 });
  });
});

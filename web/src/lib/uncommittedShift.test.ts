import { describe, it, expect } from "vitest";
import { shiftForUncommitted } from "./uncommittedShift";
import type { DiffHunk } from "../types";

describe("shiftForUncommitted", () => {
  it("leaves the line unshifted when the file has no uncommitted lines", () => {
    const hunks: DiffHunk[] = [{
      oldStart: 1, oldLines: 3, newStart: 1, newLines: 3,
      lines: [
        { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "one" },
        { type: "context", oldLineNumber: 2, newLineNumber: 2, content: "two" },
        { type: "context", oldLineNumber: 3, newLineNumber: 3, content: "three" },
      ],
    }];
    expect(shiftForUncommitted(hunks, 2)).toBe(2);
  });

  it("pushes the line down by uncommitted lines inserted before it", () => {
    const hunks: DiffHunk[] = [{
      oldStart: 1, oldLines: 3, newStart: 1, newLines: 5,
      lines: [
        { type: "add", oldLineNumber: null, newLineNumber: 1, content: "zero-a", uncommitted: true },
        { type: "add", oldLineNumber: null, newLineNumber: 2, content: "zero-b", uncommitted: true },
        { type: "context", oldLineNumber: 1, newLineNumber: 3, content: "one" },
        { type: "context", oldLineNumber: 2, newLineNumber: 4, content: "two" },
        { type: "context", oldLineNumber: 3, newLineNumber: 5, content: "three" },
      ],
    }];
    // Committed line 2 ("two") is now displayed at line 4.
    expect(shiftForUncommitted(hunks, 2)).toBe(4);
  });

  it("does not shift a line that comes before the uncommitted insertion", () => {
    const hunks: DiffHunk[] = [{
      oldStart: 1, oldLines: 3, newStart: 1, newLines: 4,
      lines: [
        { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "one" },
        { type: "add", oldLineNumber: null, newLineNumber: 2, content: "inserted", uncommitted: true },
        { type: "context", oldLineNumber: 2, newLineNumber: 3, content: "two" },
      ],
    }];
    expect(shiftForUncommitted(hunks, 1)).toBe(1);
  });

  it("shifts a line that falls in an unchanged gap after the insertion, not just an exact line match", () => {
    const hunks: DiffHunk[] = [
      {
        oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
        lines: [
          { type: "add", oldLineNumber: null, newLineNumber: 1, content: "inserted", uncommitted: true },
          { type: "context", oldLineNumber: 1, newLineNumber: 2, content: "one" },
        ],
      },
      {
        oldStart: 20, oldLines: 1, newStart: 21, newLines: 1,
        lines: [
          { type: "context", oldLineNumber: 20, newLineNumber: 21, content: "twenty" },
        ],
      },
    ];
    // Committed line 20 falls in the gap between the two hunks — still
    // shifted by the +1 offset established before it.
    expect(shiftForUncommitted(hunks, 20)).toBe(21);
  });
});

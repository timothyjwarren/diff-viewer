import { describe, it, expect } from "vitest";
import { diffStat, totalDiffStat } from "./fileSummary";
import type { DiffFile, DiffLine } from "../types";

function file(types: DiffLine["type"][]): DiffFile {
  const lines = types.map(type => ({ type, oldLineNumber: 1, newLineNumber: 1, content: "" }));
  return {
    repoPath: "/r", oldPath: "a.ts", newPath: "a.ts", status: "modified",
    hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }],
  };
}

describe("diffStat", () => {
  it("counts added and deleted lines, ignoring context", () => {
    expect(diffStat(file(["context", "add", "add", "del", "context"]))).toEqual({ added: 2, deleted: 1 });
  });

  it("sums across files", () => {
    expect(totalDiffStat([file(["add"]), file(["del", "del", "add"])])).toEqual({ added: 2, deleted: 2 });
  });
});

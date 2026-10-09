import { describe, it, expect } from "vitest";
import { isHtmlPath, changedLines, markersFor, parseBridgeMessage } from "./renderedView";
import type { CommentThread, DiffHunk } from "../types";

const hunks: DiffHunk[] = [{
  oldStart: 1, oldLines: 3, newStart: 1, newLines: 3,
  lines: [
    { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "a" },
    { type: "del", oldLineNumber: 2, newLineNumber: null, content: "b" },
    { type: "add", oldLineNumber: null, newLineNumber: 2, content: "B" },
    { type: "add", oldLineNumber: null, newLineNumber: 3, content: "C", uncommitted: true },
  ],
}];

function thread(id: string, side: "old" | "new", lineEnd: number): CommentThread {
  return {
    id, repoPath: "/r", file: "d.html", lineStart: lineEnd, lineEnd, side, resolved: false,
    pinnedRef: "abc", outdated: false, comments: [],
  } as unknown as CommentThread;
}

describe("isHtmlPath", () => {
  it("accepts .html and .htm in any case, rejects others", () => {
    expect(isHtmlPath("a/b.html")).toBe(true);
    expect(isHtmlPath("B.HTM")).toBe(true);
    expect(isHtmlPath("a.html.txt")).toBe(false);
    expect(isHtmlPath("html")).toBe(false);
  });
});

describe("changedLines", () => {
  it("returns added line numbers for the new side and deleted ones for the old side", () => {
    expect(changedLines(hunks, "new")).toEqual([2, 3]);
    expect(changedLines(hunks, "old")).toEqual([2]);
  });
});

describe("markersFor", () => {
  it("keeps only the side's threads and shifts new-side lines for uncommitted insertions", () => {
    const out = markersFor([thread("n", "new", 3), thread("o", "old", 2)], hunks, "new");
    expect(out).toEqual([{ threadId: "n", line: 4 }]);
    expect(markersFor([thread("o", "old", 2)], hunks, "old")).toEqual([{ threadId: "o", line: 2 }]);
  });
});

const rect = { top: 10, left: 4, width: 100, height: 20 };

describe("parseBridgeMessage", () => {
  it("accepts well-formed messages", () => {
    expect(parseBridgeMessage({ type: "dv-click", line: 4, rect })).toEqual({ type: "dv-click", line: 4, rect });
    expect(parseBridgeMessage({ type: "dv-marker-click", threadId: "t1", rect })).toEqual({ type: "dv-marker-click", threadId: "t1", rect });
    expect(parseBridgeMessage({ type: "dv-height", height: 640 })).toEqual({ type: "dv-height", height: 640 });
  });
  it("rejects anything else", () => {
    const bad = [
      null, "x", 5, {}, { type: "dv-click", rect }, { type: "dv-click", line: "4", rect }, { type: "dv-click", line: 4 },
      { type: "dv-click", line: 4, rect: { top: 1 } }, { type: "dv-click", line: 4, rect: { ...rect, top: NaN } },
      { type: "dv-marker-click", rect }, { type: "dv-marker-click", threadId: "t1" },
      { type: "dv-height" }, { type: "dv-height", height: -5 }, { type: "dv-height", height: Infinity },
      { type: "other", line: 1, rect },
    ];
    for (const b of bad) expect(parseBridgeMessage(b)).toBeNull();
  });
});

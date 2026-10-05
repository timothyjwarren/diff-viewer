import { describe, it, expect } from "vitest";
import { diffFingerprint, isCollapsed } from "./reviewed";
import type { DiffFile } from "../types";

const base: DiffFile = {
  repoPath: "/r", oldPath: "a.ts", newPath: "a.ts", status: "modified",
  hunks: [{
    oldStart: 1, oldLines: 2, newStart: 1, newLines: 2,
    lines: [
      { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "keep" },
      { type: "add", oldLineNumber: null, newLineNumber: 2, content: "added" },
    ],
  }],
};

describe("diffFingerprint", () => {
  it("is stable for the same diff", () => {
    expect(diffFingerprint(base)).toBe(diffFingerprint(structuredClone(base)));
  });

  it("changes when an added line changes", () => {
    const changed = structuredClone(base);
    changed.hunks[0].lines[1].content = "edited";
    expect(diffFingerprint(changed)).not.toBe(diffFingerprint(base));
  });

  it("ignores context lines and line numbers", () => {
    const shifted = structuredClone(base);
    shifted.hunks[0].lines[0].content = "other context";
    shifted.hunks[0].lines[1].newLineNumber = 40;
    expect(diffFingerprint(shifted)).toBe(diffFingerprint(base));
  });
});

describe("isCollapsed", () => {
  it("collapses a reviewed file unless the user expanded it", () => {
    expect(isCollapsed(undefined, true)).toBe(true);
    expect(isCollapsed("expanded", true)).toBe(false);
  });

  it("leaves an unreviewed file expanded unless the user collapsed it", () => {
    expect(isCollapsed(undefined, false)).toBe(false);
    expect(isCollapsed("collapsed", false)).toBe(true);
  });
});

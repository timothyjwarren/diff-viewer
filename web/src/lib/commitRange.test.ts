import { describe, it, expect } from "vitest";
import { computeRangeClick, isShaInRange, rangeCommitCount } from "./commitRange";
import type { CommitInfo } from "../types";

const commits: CommitInfo[] = ["a", "b", "c", "d"].map(sha => (
  { sha, shortSha: sha, subject: sha, author: "tj", date: "2026-01-01" }
));

describe("computeRangeClick", () => {
  it("a plain click selects just that commit and becomes the new anchor", () => {
    const result = computeRangeClick(commits, null, "b", false);
    expect(result).toEqual({ anchor: "b", from: "b", to: "b" });
  });

  it("shift-click with no prior anchor behaves like a plain click", () => {
    const result = computeRangeClick(commits, null, "b", true);
    expect(result).toEqual({ anchor: "b", from: "b", to: "b" });
  });

  it("shift-click after a plain click extends the range forward", () => {
    const anchored = computeRangeClick(commits, null, "b", false);
    const result = computeRangeClick(commits, anchored, "d", true);
    expect(result).toEqual({ anchor: "b", from: "b", to: "d" });
  });

  it("shift-click before the anchor extends the range backward", () => {
    const anchored = computeRangeClick(commits, null, "c", false);
    const result = computeRangeClick(commits, anchored, "a", true);
    expect(result).toEqual({ anchor: "c", from: "a", to: "c" });
  });

  it("a plain click after a shift-extended range starts a fresh anchor", () => {
    const anchored = computeRangeClick(commits, null, "b", false);
    const extended = computeRangeClick(commits, anchored, "d", true);
    const result = computeRangeClick(commits, extended, "a", false);
    expect(result).toEqual({ anchor: "a", from: "a", to: "a" });
  });
});

describe("isShaInRange", () => {
  it("is true for shas within the inclusive range and false outside it", () => {
    expect(isShaInRange(commits, { from: "b", to: "c" }, "a")).toBe(false);
    expect(isShaInRange(commits, { from: "b", to: "c" }, "b")).toBe(true);
    expect(isShaInRange(commits, { from: "b", to: "c" }, "c")).toBe(true);
    expect(isShaInRange(commits, { from: "b", to: "c" }, "d")).toBe(false);
  });
});

describe("rangeCommitCount", () => {
  it("counts the inclusive number of commits spanned", () => {
    expect(rangeCommitCount(commits, { from: "b", to: "c" })).toBe(2);
    expect(rangeCommitCount(commits, { from: "a", to: "d" })).toBe(4);
    expect(rangeCommitCount(commits, { from: "b", to: "b" })).toBe(1);
  });
});

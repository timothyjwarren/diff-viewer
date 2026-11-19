import { describe, it, expect } from "vitest";
import { rangeAfterReload, onScopeChange } from "./scopeChange";
import type { CommitInfo } from "../types";

const commit = (sha: string): CommitInfo => ({ sha, shortSha: sha, subject: sha, author: "", date: "" });
const commits = [commit("a1"), commit("b2"), commit("uncommitted")];

describe("rangeAfterReload", () => {
  it("keeps a range whose commits are still listed", () => {
    expect(rangeAfterReload({ from: "a1", to: "b2" }, commits, true)).toEqual({ from: "a1", to: "b2" });
  });

  it("keeps the all-plus-uncommitted range", () => {
    expect(rangeAfterReload({ from: "", to: "uncommitted" }, [], true)).toEqual({ from: "", to: "uncommitted" });
  });

  it("falls back to the scoped default when a range's commit is gone", () => {
    expect(rangeAfterReload({ from: "zz", to: "b2" }, commits, true)).toEqual({ from: "", to: "uncommitted" });
  });

  it("falls back to the committed-only view for an unscoped repo", () => {
    expect(rangeAfterReload({ from: "a1", to: "zz" }, commits, false)).toBeNull();
  });

  it("gives a repo with no range the default for its scoping", () => {
    expect(rangeAfterReload(null, commits, true)).toEqual({ from: "", to: "uncommitted" });
    expect(rangeAfterReload(null, commits, false)).toBeNull();
  });
});

describe("onScopeChange", () => {
  it("defers the reload while a comment composer is open, so the draft survives", () => {
    expect(onScopeChange(true)).toBe("defer");
    expect(onScopeChange(false)).toBe("reload");
  });
});

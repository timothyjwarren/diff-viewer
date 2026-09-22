import { describe, it, expect } from "vitest";
import { trackThreadDrift } from "./driftTracking.js";
import type { CommentThread } from "../types.js";

const baseThread: CommentThread = {
  id: "t1", repoPath: "/r", file: "a.ts", lineStart: 3, lineEnd: 3, side: "new",
  resolved: false, pinnedRef: "sha1", outdated: false, comments: [],
};

describe("trackThreadDrift", () => {
  it("leaves the thread untouched when the file is byte-identical", () => {
    const content = "one\ntwo\nthree\n";
    const result = trackThreadDrift({ thread: baseThread, snapshot: content, current: content });
    expect(result).toEqual({ lineStart: 3, lineEnd: 3, outdated: false });
  });

  it("shifts the line range when unrelated lines are inserted above it", () => {
    const snapshot = "one\ntwo\nthree\n";
    const current = "zero\none\ntwo\nthree\n";
    const result = trackThreadDrift({ thread: baseThread, snapshot, current });
    expect(result).toEqual({ lineStart: 4, lineEnd: 4, outdated: false });
  });

  it("marks the thread outdated when its own line is modified", () => {
    const snapshot = "one\ntwo\nthree\n";
    const current = "one\ntwo\nCHANGED\n";
    const result = trackThreadDrift({ thread: baseThread, snapshot, current });
    expect(result.outdated).toBe(true);
  });

  it("marks the thread outdated when its own line is deleted", () => {
    const snapshot = "one\ntwo\nthree\n";
    const current = "one\ntwo\n";
    const result = trackThreadDrift({ thread: baseThread, snapshot, current });
    expect(result.outdated).toBe(true);
  });
});

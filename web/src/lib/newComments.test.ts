import { describe, it, expect } from "vitest";
import { newAgentCommentIds } from "./newComments";
import type { CommentThread } from "../types";

function thread(id: string, comments: CommentThread["comments"]): CommentThread {
  return { id, repoPath: "/r", file: "a.ts", lineStart: 1, lineEnd: 1, side: "new", resolved: false, comments };
}

describe("newAgentCommentIds", () => {
  it("finds an agent comment added since the previous snapshot", () => {
    const previous = [thread("t1", [
      { id: "c1", author: "user", body: "why?", pending: false, createdAt: "t" },
    ])];
    const current = [thread("t1", [
      { id: "c1", author: "user", body: "why?", pending: false, createdAt: "t" },
      { id: "c2", author: "agent", body: "because", pending: false, createdAt: "t" },
    ])];
    expect(newAgentCommentIds(previous, current)).toEqual(["c2"]);
  });

  it("ignores new user comments", () => {
    const previous = [thread("t1", [])];
    const current = [thread("t1", [
      { id: "c1", author: "user", body: "why?", pending: false, createdAt: "t" },
    ])];
    expect(newAgentCommentIds(previous, current)).toEqual([]);
  });

  it("ignores comments already present", () => {
    const previous = [thread("t1", [
      { id: "c1", author: "agent", body: "hi", pending: false, createdAt: "t" },
    ])];
    const current = previous;
    expect(newAgentCommentIds(previous, current)).toEqual([]);
  });

  it("finds agent comments in a brand-new thread", () => {
    const previous: CommentThread[] = [];
    const current = [thread("t1", [
      { id: "c1", author: "agent", body: "found an issue here", pending: false, createdAt: "t" },
    ])];
    expect(newAgentCommentIds(previous, current)).toEqual(["c1"]);
  });
});

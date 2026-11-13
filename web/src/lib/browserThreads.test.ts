import { describe, it, expect } from "vitest";
import { partitionThreads } from "./browserThreads";
import type { CommentThread } from "../types";

const HEAD = "head111";

function thread(over: Partial<CommentThread>): CommentThread {
  return {
    id: "t", repoPath: "/r", file: "f.ts", lineStart: 1, lineEnd: 1, side: "new",
    resolved: false, pinnedRef: HEAD, outdated: false, comments: [], ...over,
  };
}

const ctx = (ref: string, dirtyFiles: string[] = []) => ({ repoPath: "/r", file: "f.ts", ref, headSha: HEAD, dirtyFiles });

describe("partitionThreads", () => {
  it("at the HEAD sha with a dirty file shows sha-pinned threads and hides uncommitted-pinned ones", () => {
    const a = thread({ id: "a", pinnedRef: "old222" });
    const b = thread({ id: "b", pinnedRef: "uncommitted" });
    const r = partitionThreads([a, b], ctx(HEAD, ["f.ts"]));
    expect(r.visible.map(t => t.id)).toEqual(["a"]);
    expect(r.hiddenCount).toBe(1);
  });

  it("at the HEAD sha with a clean file also shows uncommitted-pinned threads (working tree equals HEAD)", () => {
    const a = thread({ id: "a", pinnedRef: "old222" });
    const b = thread({ id: "b", pinnedRef: "uncommitted" });
    const r = partitionThreads([a, b], ctx(HEAD));
    expect(r.visible.map(t => t.id)).toEqual(["a", "b"]);
    expect(r.hiddenCount).toBe(0);
  });

  it("at uncommitted with a clean file shows sha-pinned and uncommitted-pinned threads", () => {
    const r = partitionThreads(
      [thread({ id: "a", pinnedRef: "old222" }), thread({ id: "b", pinnedRef: "uncommitted" })],
      ctx("uncommitted"),
    );
    expect(r.visible.map(t => t.id)).toEqual(["a", "b"]);
    expect(r.hiddenCount).toBe(0);
  });

  it("at uncommitted with a dirty file shows only uncommitted-pinned threads", () => {
    const r = partitionThreads(
      [thread({ id: "a", pinnedRef: "old222" }), thread({ id: "b", pinnedRef: "uncommitted" })],
      ctx("uncommitted", ["f.ts"]),
    );
    expect(r.visible.map(t => t.id)).toEqual(["b"]);
    expect(r.hiddenCount).toBe(1);
  });

  it("at any other ref shows none and counts the file's live threads", () => {
    const r = partitionThreads([thread({ id: "a" }), thread({ id: "b", pinnedRef: "uncommitted" })], ctx("older333"));
    expect(r.visible).toEqual([]);
    expect(r.hiddenCount).toBe(2);
  });

  it("ignores other files and repos, outdated threads and old-side threads", () => {
    const r = partitionThreads(
      [
        thread({ id: "file", file: "g.ts" }),
        thread({ id: "repo", repoPath: "/other" }),
        thread({ id: "out", outdated: true }),
        thread({ id: "old", side: "old" }),
      ],
      ctx("older333"),
    );
    expect(r).toEqual({ visible: [], hiddenCount: 0 });
  });
});

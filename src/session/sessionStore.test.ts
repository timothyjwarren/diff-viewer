import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "./sessionStore.js";

describe("SessionStore", () => {
  let dataDir: string;
  const repos = [{ path: "/repo", name: "repo", baseRef: "abc123" }];

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dv-session-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("an immediate (non-pending) user comment notifies right away", () => {
    const store = SessionStore.create(repos, "s1", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "what does this do?", pending: false,
    });
    expect(thread.comments[0].pending).toBe(false);
    expect(store.notificationsSince(0)).toEqual([
      expect.objectContaining({ type: "comment", threadId: thread.id, commentId: thread.comments[0].id }),
    ]);
  });

  it("a pending user comment does not notify until a verdict is submitted", () => {
    const store = SessionStore.create(repos, "s1", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "consider renaming this", pending: true,
    });
    expect(store.notificationsSince(0)).toEqual([]);

    const verdict = store.addVerdict("request_changes", "please address my comments");
    expect(store.notificationsSince(0)).toEqual([
      expect.objectContaining({ type: "verdict", verdictId: verdict.id }),
    ]);

    const detail = store.getVerdictDetail(verdict.id);
    expect(detail.intent).toBe("changes_requested");
    expect(detail.threads).toHaveLength(1);
    expect(detail.threads[0].id).toBe(thread.id);
    expect(detail.threads[0].comments[0].pending).toBe(false);
    expect(detail.threads[0].comments[0].verdictId).toBe(verdict.id);
  });

  it("agent-authored comments are never pending and never notify", () => {
    const store = SessionStore.create(repos, "s1", dataDir);
    store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "agent", body: "this could be simplified", pending: true,
    });
    expect(store.notificationsSince(0)).toEqual([]);
  });

  it("supports replies, edits, and deletes", () => {
    const store = SessionStore.create(repos, "s1", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "question", pending: false,
    });
    const reply = store.addReply(thread.id, "agent", "answer");
    expect(store.snapshot.threads[0].comments).toHaveLength(2);

    store.editComment(thread.id, reply.id, "edited answer");
    expect(store.snapshot.threads[0].comments[1].body).toBe("edited answer");

    store.deleteComment(thread.id, reply.id);
    expect(store.snapshot.threads[0].comments).toHaveLength(1);
  });

  it("persists and reloads session data", async () => {
    const store = SessionStore.create(repos, "s1", dataDir);
    store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "hi", pending: false,
    });
    await store.persist();

    const reloaded = await SessionStore.load(path.join(dataDir, "s1.json"));
    expect(reloaded.snapshot.threads).toHaveLength(1);
  });
});

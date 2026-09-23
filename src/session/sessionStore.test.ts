import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "./sessionStore.js";

describe("SessionStore", () => {
  let dataDir: string;
  const repos = [{ path: "/repo", name: "repo", branch: "main", baseRef: "abc123" }];

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dv-session-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("an immediate (non-pending) user comment notifies right away", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "what does this do?", pending: false, pinnedRef: "abc123",
    });
    expect(thread.comments[0].pending).toBe(false);
    expect(store.notificationsSince(0)).toEqual([
      expect.objectContaining({ type: "comment", threadId: thread.id, commentId: thread.comments[0].id }),
    ]);
  });

  it("a pending user comment does not notify until a verdict is submitted", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "consider renaming this", pending: true, pinnedRef: "abc123",
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
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "agent", body: "this could be simplified", pending: true, pinnedRef: "abc123",
    });
    expect(store.notificationsSince(0)).toEqual([]);
  });

  it("supports replies, edits, and deletes", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "question", pending: false, pinnedRef: "abc123",
    });
    const reply = store.addReply(thread.id, "agent", "answer");
    expect(store.snapshot.threads[0].comments).toHaveLength(2);

    store.editComment(thread.id, reply.id, "edited answer");
    expect(store.snapshot.threads[0].comments[1].body).toBe("edited answer");

    store.deleteComment(thread.id, reply.id);
    expect(store.snapshot.threads[0].comments).toHaveLength(1);
  });

  it("resolveThread toggles a thread's resolved state", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "question", pending: false,
    });
    expect(store.snapshot.threads[0].resolved).toBe(false);

    store.resolveThread(thread.id, true);
    expect(store.snapshot.threads[0].resolved).toBe(true);

    store.resolveThread(thread.id, false);
    expect(store.snapshot.threads[0].resolved).toBe(false);
  });

  it("ackComment sets agentStatus to acked; unackComment clears it to a terminal cleared state", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "please rename this", pending: false, pinnedRef: "abc123",
    });
    const commentId = thread.comments[0].id;

    store.ackComment(thread.id, commentId);
    expect(store.snapshot.threads[0].comments[0].agentStatus).toBe("acked");

    store.unackComment(thread.id, commentId);
    expect(store.snapshot.threads[0].comments[0].agentStatus).toBe("cleared");
  });

  it("markAllSeen marks every untouched comment as seen, without resurrecting acked or cleared ones", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const t1 = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "one", pending: false, pinnedRef: "abc123",
    });
    store.addThread({
      repoPath: "/repo", file: "b.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "two", pending: false, pinnedRef: "abc123",
    });
    expect(store.snapshot.threads.flatMap(t => t.comments).every(c => !c.agentStatus)).toBe(true);

    store.markAllSeen();
    expect(store.snapshot.threads.flatMap(t => t.comments).every(c => c.agentStatus === "seen")).toBe(true);

    // A new reply is untouched (no agentStatus) until the next markAllSeen.
    store.addReply(t1.id, "user", "still here?");
    expect(store.snapshot.threads.find(t => t.id === t1.id)!.comments.at(-1)!.agentStatus).toBeUndefined();

    // ack + unack the first comment, then re-run markAllSeen: neither should be
    // touched, since both already have an agentStatus.
    const firstCommentId = t1.comments[0].id;
    store.ackComment(t1.id, firstCommentId);
    store.unackComment(t1.id, firstCommentId);
    store.markAllSeen();
    expect(store.snapshot.threads.find(t => t.id === t1.id)!.comments[0].agentStatus).toBe("cleared");
  });

  it("markAllSeen never marks a pending comment as seen", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "queued for review", pending: true,
    });

    store.markAllSeen();
    expect(store.snapshot.threads.find(t => t.id === thread.id)!.comments[0].agentStatus).toBeUndefined();
  });

  it("markAllSeen never marks the agent's own comments", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "why?", pending: false, pinnedRef: "abc123",
    });
    store.addReply(thread.id, "agent", "because");

    store.markAllSeen();
    const [userComment, agentComment] = store.snapshot.threads[0].comments;
    expect(userComment.agentStatus).toBe("seen");
    expect(agentComment.agentStatus).toBeUndefined();
  });

  it("persists and reloads session data", async () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "hi", pending: false, pinnedRef: "abc123",
    });
    await store.persist();

    const reloaded = await SessionStore.load(path.join(dataDir, "s1.json"));
    expect(reloaded.snapshot.threads).toHaveLength(1);
  });

  it("addThread stamps pinnedRef, defaults outdated to false, and starts with no threads resolved", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "q", pending: false, pinnedRef: "abc123",
    });
    expect(thread.pinnedRef).toBe("abc123");
    expect(thread.outdated).toBe(false);
  });

  it("ensureContentSnapshot stores a snapshot once per (pinnedRef, file) and does not overwrite it", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    store.ensureContentSnapshot("abc123", "a.txt", "one\ntwo\n");
    store.ensureContentSnapshot("abc123", "a.txt", "SHOULD NOT OVERWRITE\n");
    expect(store.snapshot.contentSnapshots["abc123:a.txt"]).toBe("one\ntwo\n");
  });

  it("recomputeThreadPositions repositions unaffected threads and backfills an uncommitted pin once committed", async () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "q", pending: false, pinnedRef: "uncommitted",
    });
    store.ensureContentSnapshot("uncommitted", "a.txt", "one\n");

    await store.recomputeThreadPositions(
      "/repo", "newsha123", false,
      async () => "one\n",
      async () => "one\n",
    );

    expect(store.snapshot.threads[0].pinnedRef).toBe("newsha123");
    expect(store.snapshot.threads[0].outdated).toBe(false);
  });

  it("addThread uses a given createdAt instead of the current time", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "old comment", pending: false, pinnedRef: "abc123",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    expect(thread.comments[0].createdAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("addReply uses a given createdAt instead of the current time", () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "question", pending: false, pinnedRef: "abc123",
    });
    const reply = store.addReply(thread.id, "agent", "answer", undefined, false, "2020-06-15T12:00:00.000Z");
    expect(reply.createdAt).toBe("2020-06-15T12:00:00.000Z");
  });

  describe("importFrom", () => {
    const newRepos = [{ path: "/repo2", name: "repo2", branch: "main", baseRef: "def456" }];

    it("copies threads/verdicts/notifications/contentSnapshots into a new session, preserving comment author and createdAt", async () => {
      const source = SessionStore.create(repos, "src", "source session", dataDir);
      source.addThread({
        repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
        author: "user", body: "old question", pending: false, pinnedRef: "abc123",
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      source.ensureContentSnapshot("abc123", "a.txt", "one\n");
      const verdict = source.addVerdict("comment", "fyi");
      await source.persist();

      const imported = await SessionStore.importFrom(
        path.join(dataDir, "src.json"), "new-id", newRepos, undefined, dataDir,
      );

      expect(imported.id).toBe("new-id");
      const snap = imported.snapshot;
      expect(snap.repos).toEqual(newRepos);
      expect(snap.title).toBe("source session");
      expect(snap.threads).toHaveLength(1);
      expect(snap.threads[0].comments[0]).toMatchObject({
        author: "user", body: "old question", createdAt: "2020-01-01T00:00:00.000Z",
      });
      expect(snap.verdicts).toEqual([verdict]);
      expect(snap.contentSnapshots).toEqual({ "abc123:a.txt": "one\n" });
      expect(snap.status).toBe("active");
    });

    it("imports pending comments as-is", async () => {
      const source = SessionStore.create(repos, "src2", "source session", dataDir);
      source.addThread({
        repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
        author: "user", body: "queued", pending: true, pinnedRef: "abc123",
      });
      await source.persist();

      const imported = await SessionStore.importFrom(
        path.join(dataDir, "src2.json"), "new-id-2", newRepos, undefined, dataDir,
      );
      expect(imported.snapshot.threads[0].comments[0].pending).toBe(true);
    });

    it("uses an explicit title override instead of the source title", async () => {
      const source = SessionStore.create(repos, "src3", "source session", dataDir);
      await source.persist();

      const imported = await SessionStore.importFrom(
        path.join(dataDir, "src3.json"), "new-id-3", newRepos, "custom title", dataDir,
      );
      expect(imported.snapshot.title).toBe("custom title");
    });
  });

  it("recomputeThreadPositions does not compound a shift across repeated calls", async () => {
    const store = SessionStore.create(repos, "s1", "test session", dataDir);
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 3, lineEnd: 3, side: "new",
      author: "user", body: "q", pending: false, pinnedRef: "sha1",
    });
    store.ensureContentSnapshot("sha1", "a.txt", "one\ntwo\nthree\n");
    const current = "zero\none\ntwo\nthree\n"; // one line inserted above the commented range

    // A line-inserting change lands as one commit, but a session might poll
    // /api/repo-state (and thus recompute) more than once while it's the
    // current HEAD — e.g. once while the working tree is still dirty, once
    // more right after the commit lands. Both calls diff the same
    // unchanged file content against the same cached snapshot, so the
    // second call must be a no-op, not a second application of the shift.
    await store.recomputeThreadPositions("/repo", "sha2", false, async () => "one\ntwo\nthree\n", async () => current);
    expect(store.snapshot.threads.find(t => t.id === thread.id)!.lineStart).toBe(4);

    await store.recomputeThreadPositions("/repo", "sha2", false, async () => "one\ntwo\nthree\n", async () => current);
    expect(store.snapshot.threads.find(t => t.id === thread.id)!.lineStart).toBe(4);
  });
});

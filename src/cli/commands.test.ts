import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { spawn } from "node:child_process";
import { createApp } from "../api/app.js";
import { SessionStore } from "../session/sessionStore.js";
import { writeRegistryEntry, removeRegistryEntry } from "../registry.js";
import {
  waitCommand, watchCommand, reviewCommand, replyCommand, commentCommand, ackCommand, unackCommand,
  stopCommand, sessionsCommand,
} from "./commands.js";

describe("cli commands", () => {
  let home: string;
  let server: Server;
  let sessionId: string;
  let store: SessionStore;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "dv-cli-"));
    process.env.DIFFVIEWER_HOME = home;
    sessionId = "s1";
    store = SessionStore.create([{ path: "/repo", name: "repo", branch: "main", baseRef: "abc" }], sessionId, "test session", path.join(home, "data"));
    const app = createApp(store);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await writeRegistryEntry(sessionId, { port, pid: process.pid });
  });

  afterEach(async () => {
    server.close();
    delete process.env.DIFFVIEWER_HOME;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("commentCommand creates an agent-authored, immediate thread", async () => {
    await commentCommand(sessionId, "/repo", "a.txt", 1, 1, "new", "consider simplifying this");
    const threads = store.snapshot.threads;
    expect(threads).toHaveLength(1);
    expect(threads[0].comments[0].author).toBe("agent");
    expect(threads[0].comments[0].pending).toBe(false);
  });

  it("replyCommand posts an agent reply into an existing thread", async () => {
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "why?", pending: false,
    });
    await replyCommand(sessionId, thread.id, "because of X");
    expect(store.snapshot.threads[0].comments[1].body).toBe("because of X");
  });

  it("ackCommand and unackCommand move a comment's agentStatus from acked to cleared", async () => {
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "please rename this", pending: false,
    });
    const commentId = thread.comments[0].id;

    await ackCommand(sessionId, thread.id, commentId);
    expect(store.snapshot.threads[0].comments[0].agentStatus).toBe("acked");

    await unackCommand(sessionId, thread.id, commentId);
    expect(store.snapshot.threads[0].comments[0].agentStatus).toBe("cleared");
  });

  it("reviewCommand returns threads and verdicts with computed intent", async () => {
    store.addVerdict("request_changes", "please fix");
    const result = await reviewCommand(sessionId) as any;
    expect(result.verdicts[0].intent).toBe("changes_requested");
  });

  it("reviewCommand omits pending comments, and threads that are pending-only", async () => {
    const shownThread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "why?", pending: false,
    });
    store.addReply(shownThread.id, "user", "also, why this?", undefined, true);
    const hiddenThread = store.addThread({
      repoPath: "/repo", file: "b.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "queued for review", pending: true,
    });

    const result = await reviewCommand(sessionId) as any;

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].id).toBe(shownThread.id);
    expect(result.threads[0].comments).toHaveLength(1);
    expect(result.threads[0].comments[0].body).toBe("why?");
    expect(result.threads.some((t: any) => t.id === hiddenThread.id)).toBe(false);
  });

  it("reviewCommand marks comments as seen as a side effect of the agent reading them", async () => {
    const thread = store.addThread({
      repoPath: "/repo", file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "why?", pending: false,
    });
    expect(store.snapshot.threads[0].comments[0].agentStatus).toBeUndefined();

    await reviewCommand(sessionId);
    expect(store.snapshot.threads.find(t => t.id === thread.id)!.comments[0].agentStatus).toBe("seen");
  });

  it("waitCommand resolves once a verdict is submitted and advances the cursor", async () => {
    const waitPromise = waitCommand(sessionId);
    await new Promise(resolve => setTimeout(resolve, 50));
    store.addVerdict("approve", "lgtm");
    const result = await waitPromise as any;
    expect(result.notifications[0].type).toBe("verdict");
  });

  it("sessionsCommand finds an active session for a given repo path", async () => {
    await store.persist();
    const found = await sessionsCommand("/repo");
    expect(found).toEqual([{ sessionId: "s1", repos: [{ path: "/repo", name: "repo", branch: "main", baseRef: "abc" }] }]);
    expect(await sessionsCommand("/nonexistent")).toEqual([]);
  });

  it("sessionsCommand matches a repo filter regardless of a trailing slash or relative form", async () => {
    await store.persist();
    expect(await sessionsCommand("/repo/")).toHaveLength(1);
    expect(await sessionsCommand("/repo/../repo")).toHaveLength(1);
  });

  it("watchCommand prints one line per notification and keeps looping across events", async () => {
    // A short long-poll timeout so the pending request unblocks quickly once
    // this test removes the registry entry, instead of waiting out the
    // production 55s hold.
    const fastApp = createApp(store, undefined, 50);
    const fastServer = fastApp.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => fastServer.once("listening", resolve));
    const fastAddress = fastServer.address();
    const fastPort = typeof fastAddress === "object" && fastAddress ? fastAddress.port : 0;
    await writeRegistryEntry(sessionId, { port: fastPort, pid: process.pid });

    const lines: string[] = [];
    const watchPromise = watchCommand(sessionId, line => lines.push(line));
    await new Promise(resolve => setTimeout(resolve, 50));
    store.addVerdict("approve", "lgtm");
    await new Promise(resolve => setTimeout(resolve, 50));
    store.addVerdict("comment", "one more thing");
    await new Promise(resolve => setTimeout(resolve, 50));
    // Mirror what stopCommand does: remove the registry entry, then take the
    // server down, so the in-flight long-poll fails with a connection error.
    await removeRegistryEntry(sessionId);
    fastServer.close();
    await watchPromise;

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).type).toBe("verdict");
    expect(JSON.parse(lines[1]).type).toBe("verdict");
    expect(JSON.parse(lines[2])).toEqual({ type: "session_ended" });
  });

  it("stopCommand kills the process referenced by the registry entry", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    await writeRegistryEntry("to-stop", { port: 0, pid: child.pid! });
    await stopCommand("to-stop");
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(() => process.kill(child.pid!, 0)).toThrow();
  });
});

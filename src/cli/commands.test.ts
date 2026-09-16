import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { spawn } from "node:child_process";
import { createApp } from "../api/app.js";
import { SessionStore } from "../session/sessionStore.js";
import { writeRegistryEntry } from "../registry.js";
import { waitCommand, reviewCommand, replyCommand, commentCommand, stopCommand, sessionsCommand } from "./commands.js";

describe("cli commands", () => {
  let home: string;
  let server: Server;
  let sessionId: string;
  let store: SessionStore;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "dv-cli-"));
    process.env.DIFFVIEWER_HOME = home;
    sessionId = "s1";
    store = SessionStore.create([{ path: "/repo", name: "repo", baseRef: "abc" }], sessionId, path.join(home, "data"));
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

  it("reviewCommand returns threads and verdicts with computed intent", async () => {
    store.addVerdict("request_changes", "please fix");
    const result = await reviewCommand(sessionId) as any;
    expect(result.verdicts[0].intent).toBe("changes_requested");
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
    expect(found).toEqual([{ sessionId: "s1", repos: [{ path: "/repo", name: "repo", baseRef: "abc" }] }]);
    expect(await sessionsCommand("/nonexistent")).toEqual([]);
  });

  it("stopCommand kills the process referenced by the registry entry", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
    await writeRegistryEntry("to-stop", { port: 0, pid: child.pid! });
    await stopCommand("to-stop");
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(() => process.kill(child.pid!, 0)).toThrow();
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setupSession } from "./setupSession.js";

const execFileAsync = promisify(execFile);
async function git(cwd: string, args: string[]) {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

describe("setupSession", () => {
  let home: string;
  let repoPath: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "dv-setup-"));
    process.env.DIFFVIEWER_HOME = home;
    repoPath = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dv-setup-repo-")));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\n");
    await fs.writeFile(path.join(repoPath, "b.txt"), "two\n");
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
  });

  afterEach(async () => {
    delete process.env.DIFFVIEWER_HOME;
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("resumes an existing session unchanged", async () => {
    const { store, sessionId } = await setupSession(["--session-id", "s1", "--files", path.join(repoPath, "a.txt")], "/");
    const thread = store.addThread({
      repoPath, file: "a.txt", lineStart: 1, lineEnd: 1, side: "new",
      author: "user", body: "why?", pending: false, pinnedRef: store.snapshot.repos[0].baseRef,
    });
    await store.persist();
    const before = store.snapshot;
    expect(before.notifications.length).toBeGreaterThan(0);

    const resumed = await setupSession(["--session-id", sessionId, "--resume"], "/");
    const after = resumed.store.snapshot;
    expect(after.id).toBe("s1");
    expect(after.repos).toEqual(before.repos);
    expect(after.scope).toEqual(before.scope);
    expect(after.threads.map(t => t.id)).toEqual([thread.id]);
    expect(after.threads).toEqual(before.threads);
    expect(after.notifications).toEqual(before.notifications);
  });

  it("applies --title and --description when resuming", async () => {
    await setupSession(["--session-id", "s1", repoPath], "/");
    const { store } = await setupSession(["--session-id", "s1", "--resume", "--title", "T2", "--description", "D2"], "/");
    expect(store.snapshot.title).toBe("T2");
    expect(store.snapshot.description).toBe("D2");
  });

  it("rejects --resume with repo args, --files or --import-session", async () => {
    await setupSession(["--session-id", "s1", repoPath], "/");
    const msg = /--resume takes no repo paths, --files or --import-session/;
    await expect(setupSession(["--session-id", "s1", "--resume", repoPath], "/")).rejects.toThrow(msg);
    await expect(setupSession(["--session-id", "s1", "--resume", "--files", "a.txt"], repoPath)).rejects.toThrow(msg);
    await expect(setupSession(["--session-id", "s1", "--resume", "--import-session", "x"], "/")).rejects.toThrow(msg);
  });

  it("fails to resume a session with no data file", async () => {
    await expect(setupSession(["--session-id", "s1", "--resume"], "/")).rejects.toThrow(/no saved session s1/);
  });

  it("infers the repo from --files when no repo args are given, and scopes the session", async () => {
    const { store } = await setupSession(["--session-id", "s1", "--files", path.join(repoPath, "a.txt")], "/");
    expect(store.snapshot.repos.map(r => r.path)).toEqual([repoPath]);
    expect(store.snapshot.scope).toEqual([{ repoPath, path: "a.txt", kind: "file" }]);
  });

  it("resolves --files relative to cwd and accepts repo args after --", async () => {
    const { store } = await setupSession(["--session-id", "s1", "--files", "a.txt", "b.txt", "--", repoPath], repoPath);
    expect(store.snapshot.scope?.map(e => e.path)).toEqual(["a.txt", "b.txt"]);
  });

  it("ends the --files list at a following flag, so repo args after that flag stay repo args", async () => {
    const { store } = await setupSession(["--session-id", "s1", "--files", "a.txt", "--title", "T", repoPath], repoPath);
    expect(store.snapshot.scope).toEqual([{ repoPath, path: "a.txt", kind: "file" }]);
    expect(store.snapshot.title).toBe("T");
  });

  it("starts unscoped without --files", async () => {
    const { store } = await setupSession(["--session-id", "s1", repoPath], "/");
    expect(store.snapshot.scope).toBeNull();
  });

  it("fails naming a path outside the session repos", async () => {
    await expect(setupSession(["--session-id", "s1", "--files", "/elsewhere/x", "--", repoPath], "/")).rejects.toThrow(/Not inside any session repo: \/elsewhere\/x/);
  });

  it("carries an imported scope over, warning about entries with no matching repo", async () => {
    const { store: first } = await setupSession(["--session-id", "src", "--files", path.join(repoPath, "a.txt")], "/");
    const raw = JSON.parse(await fs.readFile(path.join(home, "data", "src.json"), "utf-8"));
    raw.scope.push({ repoPath: "/old/nowhere", path: "z.txt", kind: "file" });
    await fs.writeFile(path.join(home, "data", "src.json"), JSON.stringify(raw));
    const { store, warnings } = await setupSession(["--session-id", "s2", "--import-session", "src", repoPath], "/");
    expect(store.snapshot.scope).toEqual(first.snapshot.scope);
    expect(warnings).toEqual(["dropped scope entry /old/nowhere:z.txt (no matching repo)"]);
  });
});

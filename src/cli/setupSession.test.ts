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

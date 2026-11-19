import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scopeFingerprints } from "./fingerprint.js";
import type { ScopeEntry } from "../types.js";

const execFileAsync = promisify(execFile);
async function git(cwd: string, args: string[]) {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

describe("scopeFingerprints", () => {
  let repoPath: string;
  let baseRef: string;
  let entries: ScopeEntry[];

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-fp-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.mkdir(path.join(repoPath, "dir"));
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\n");
    await fs.writeFile(path.join(repoPath, "dir", "c.txt"), "c\n");
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
    baseRef = await git(repoPath, ["rev-parse", "HEAD"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\n");
    entries = [{ repoPath, path: "a.txt", kind: "file" }, { repoPath, path: "dir", kind: "dir" }];
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("is unchanged when the working-tree contents are committed", async () => {
    const before = await scopeFingerprints(repoPath, baseRef, entries, "uncommitted");
    await git(repoPath, ["commit", "-qam", "commit a"]);
    expect(await scopeFingerprints(repoPath, baseRef, entries, "uncommitted")).toEqual(before);
    expect(before.changed).toEqual(["a.txt"]);
    expect(before.files["a.txt"]).toMatch(/^[0-9a-f]{40}$/);
  });

  it("changes when a scoped file is edited", async () => {
    const before = await scopeFingerprints(repoPath, baseRef, entries, "uncommitted");
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\n");
    const after = await scopeFingerprints(repoPath, baseRef, entries, "uncommitted");
    expect(after.files["a.txt"]).not.toBe(before.files["a.txt"]);
  });

  it("maps a deleted scoped file to null", async () => {
    await fs.rm(path.join(repoPath, "a.txt"));
    const state = await scopeFingerprints(repoPath, baseRef, entries, "uncommitted");
    expect(state.files["a.txt"]).toBeNull();
    expect(state.changed).toEqual(["a.txt"]);
  });

  it("lists new modified and untracked files under a scoped directory", async () => {
    await fs.writeFile(path.join(repoPath, "dir", "c.txt"), "changed\n");
    await fs.writeFile(path.join(repoPath, "dir", "d.txt"), "new\n");
    const state = await scopeFingerprints(repoPath, baseRef, entries, "uncommitted");
    expect(state.changed).toEqual(["a.txt", "dir/c.txt", "dir/d.txt"]);
    expect(Object.keys(state.files).sort()).toEqual(["a.txt", "dir/c.txt", "dir/d.txt"]);
  });

  it("reads blob ids at a commit", async () => {
    const sha = await git(repoPath, ["rev-parse", "HEAD"]);
    const state = await scopeFingerprints(repoPath, baseRef, entries, sha);
    expect(state.files["a.txt"]).toBe(await git(repoPath, ["rev-parse", `${sha}:a.txt`]));
    expect(state.changed).toEqual([]);
  });

  it("handles a file name with a space", async () => {
    await fs.writeFile(path.join(repoPath, "my file.sh"), "x\n");
    const state = await scopeFingerprints(repoPath, baseRef, [{ repoPath, path: "my file.sh", kind: "file" }], "uncommitted");
    expect(state.files["my file.sh"]).toMatch(/^[0-9a-f]{40}$/);
    expect(state.changed).toEqual(["my file.sh"]);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectDefaultBranch, resolveMergeBase, resolveBaseRef, listCommits, getCurrentBranch, assertValidRepoPath, resolveHeadSha, isDirty, listDirtyFiles } from "./gitRepo.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}

describe("gitRepo", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-git-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\n");
    await git(repoPath, ["add", "a.txt"]);
    await git(repoPath, ["commit", "-m", "base"]);
    await git(repoPath, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\n");
    await git(repoPath, ["commit", "-am", "feature commit"]);
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("detects the default branch as main when no origin/HEAD is set", async () => {
    expect(await detectDefaultBranch(repoPath)).toBe("main");
  });

  it("resolves the merge base between HEAD and main", async () => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "main"], { cwd: repoPath });
    expect(await resolveMergeBase(repoPath, "main")).toBe(stdout.trim());
  });

  it("resolveBaseRef falls back to merge-base with default branch when no override given", async () => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "main"], { cwd: repoPath });
    expect(await resolveBaseRef(repoPath)).toBe(stdout.trim());
  });

  it("resolveBaseRef honors an explicit override", async () => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "feature"], { cwd: repoPath });
    expect(await resolveBaseRef(repoPath, "feature")).toBe(stdout.trim());
  });

  it("lists commits ahead of baseRef, oldest first", async () => {
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\n");
    await git(repoPath, ["commit", "-am", "second feature commit"]);

    const { stdout } = await execFileAsync("git", ["log", "--format=%H", "main..feature"], { cwd: repoPath });
    const [newestSha, oldestSha] = stdout.trim().split("\n");

    const commits = await listCommits(repoPath, "main");
    expect(commits.map(c => c.sha)).toEqual([oldestSha, newestSha]);
    expect(commits[0].subject).toBe("feature commit");
    expect(commits[1].subject).toBe("second feature commit");
    expect(commits[0].shortSha).toHaveLength(7);
    expect(commits[0].author).toBe("Test");
    expect(commits[0].date).toBeTruthy();
  });

  it("getCurrentBranch returns the checked-out branch name", async () => {
    expect(await getCurrentBranch(repoPath)).toBe("feature");
  });

  it("getCurrentBranch falls back to a short sha when HEAD is detached", async () => {
    await git(repoPath, ["checkout", "--detach"]);
    const branch = await getCurrentBranch(repoPath);
    expect(branch).toMatch(/^[0-9a-f]{7,}$/);
  });

  it("assertValidRepoPath resolves for a real git repo", async () => {
    await expect(assertValidRepoPath(repoPath)).resolves.toBeUndefined();
  });

  it("assertValidRepoPath rejects a path that doesn't exist", async () => {
    await expect(assertValidRepoPath(path.join(repoPath, "nope"))).rejects.toThrow(/No such directory/);
  });

  it("assertValidRepoPath rejects a file that isn't a directory", async () => {
    await expect(assertValidRepoPath(path.join(repoPath, "a.txt"))).rejects.toThrow(/Not a directory/);
  });

  it("assertValidRepoPath rejects a directory that isn't a git repo", async () => {
    const plainDir = await fs.mkdtemp(path.join(os.tmpdir(), "dv-notgit-"));
    try {
      await expect(assertValidRepoPath(plainDir)).rejects.toThrow(/Not a git repository/);
    } finally {
      await fs.rm(plainDir, { recursive: true, force: true });
    }
  });

  it("resolves the current HEAD sha", async () => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    expect(await resolveHeadSha(repoPath)).toBe(stdout.trim());
  });

  it("isDirty is false on a clean checkout and true after an edit", async () => {
    expect(await isDirty(repoPath)).toBe(false);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nTHREE\n");
    expect(await isDirty(repoPath)).toBe(true);
  });

  it("listDirtyFiles names only the files with uncommitted changes", async () => {
    expect(await listDirtyFiles(repoPath)).toEqual([]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nTHREE\n");
    await fs.writeFile(path.join(repoPath, "b.txt"), "new file\n");
    await git(repoPath, ["add", "b.txt"]);
    expect(await listDirtyFiles(repoPath)).toEqual(["a.txt", "b.txt"]);
  });
});

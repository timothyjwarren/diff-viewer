import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectDefaultBranch, resolveMergeBase, resolveBaseRef } from "./gitRepo.js";

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
});

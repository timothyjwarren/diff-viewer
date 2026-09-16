import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { computeDiff } from "./diff.js";
import { resolveBaseRef } from "./gitRepo.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}

describe("computeDiff", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-diff-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\n");
    await git(repoPath, ["add", "a.txt"]);
    await git(repoPath, ["commit", "-m", "base"]);
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("includes both committed and uncommitted changes since the base ref", async () => {
    const baseRef = await resolveBaseRef(repoPath);
    await git(repoPath, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\n");
    await git(repoPath, ["commit", "-am", "committed change"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\nuncommitted\n");

    const files = await computeDiff(repoPath, baseRef);
    expect(files).toHaveLength(1);
    const addedLines = files[0].hunks.flatMap(h => h.lines).filter(l => l.type === "add").map(l => l.content);
    expect(addedLines).toEqual(["committed", "uncommitted"]);
  });
});

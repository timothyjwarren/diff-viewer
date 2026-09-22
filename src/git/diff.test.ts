import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { computeDiff, computeRangeDiff, computeDiffIncludingUncommitted, markUncommittedLines } from "./diff.js";
import { resolveBaseRef, resolveHeadSha } from "./gitRepo.js";

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

  it("computeDiff only includes committed changes, not the working tree", async () => {
    const baseRef = await resolveBaseRef(repoPath);
    await git(repoPath, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\n");
    await git(repoPath, ["commit", "-am", "committed change"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\nUNCOMMITTED\n");

    const files = await computeDiff(repoPath, baseRef);
    expect(files).toHaveLength(1);
    const addedLines = files[0].hunks.flatMap(h => h.lines).filter(l => l.type === "add").map(l => l.content);
    expect(addedLines).toEqual(["committed"]);
    expect(addedLines.some(l => l.includes("UNCOMMITTED"))).toBe(false);
  });

  it("computeRangeDiff treats to='uncommitted' as a diff against the working tree", async () => {
    await git(repoPath, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\n");
    await git(repoPath, ["commit", "-am", "committed change"]);
    const { stdout: committedSha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\nUNCOMMITTED\n");

    const files = await computeRangeDiff(repoPath, committedSha.trim(), "uncommitted");
    const addedLines = files.flatMap(f => f.hunks).flatMap(h => h.lines).map(l => l.content);
    expect(addedLines.some(l => l.includes("UNCOMMITTED"))).toBe(true);
  });

  it("computeRangeDiff diffs only the given inclusive commit range, ignoring uncommitted changes", async () => {
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\n");
    await git(repoPath, ["commit", "-am", "first"]);
    const { stdout: firstSha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\nfour\n");
    await git(repoPath, ["commit", "-am", "second"]);
    const { stdout: secondSha } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\nthree\nfour\nuncommitted\n");

    const onlyFirst = await computeRangeDiff(repoPath, firstSha.trim(), firstSha.trim());
    expect(onlyFirst[0].hunks.flatMap(h => h.lines).filter(l => l.type === "add").map(l => l.content))
      .toEqual(["three"]);

    const both = await computeRangeDiff(repoPath, firstSha.trim(), secondSha.trim());
    expect(both[0].hunks.flatMap(h => h.lines).filter(l => l.type === "add").map(l => l.content))
      .toEqual(["three", "four"]);
  });

  it("computeDiffIncludingUncommitted includes both committed history and the working tree", async () => {
    const baseRef = await resolveBaseRef(repoPath);
    await git(repoPath, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\n");
    await git(repoPath, ["commit", "-am", "committed change"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\nuncommitted\n");

    const files = await computeDiffIncludingUncommitted(repoPath, baseRef);
    const addedLines = files.flatMap(f => f.hunks).flatMap(h => h.lines).filter(l => l.type === "add").map(l => l.content);
    expect(addedLines).toEqual(["committed", "uncommitted"]);
  });

  it("markUncommittedLines flags only the added lines that differ from HEAD, not earlier committed additions", async () => {
    const baseRef = await resolveBaseRef(repoPath);
    await git(repoPath, ["checkout", "-b", "feature"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\n");
    await git(repoPath, ["commit", "-am", "committed change"]);
    const headSha = await resolveHeadSha(repoPath);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\nuncommitted\n");

    const files = await computeDiffIncludingUncommitted(repoPath, baseRef);
    await markUncommittedLines(repoPath, headSha, files);

    const addLines = files.flatMap(f => f.hunks).flatMap(h => h.lines).filter(l => l.type === "add");
    const committedLine = addLines.find(l => l.content === "committed")!;
    const uncommittedLine = addLines.find(l => l.content === "uncommitted")!;
    expect(committedLine.uncommitted).toBeFalsy();
    expect(uncommittedLine.uncommitted).toBe(true);
  });

  it("markUncommittedLines flags every added line for a file that is new in the working tree", async () => {
    const headSha = await resolveHeadSha(repoPath);
    await fs.writeFile(path.join(repoPath, "new.txt"), "brand new\nfile\n");
    await git(repoPath, ["add", "new.txt"]);

    const files = await computeDiffIncludingUncommitted(repoPath, await resolveBaseRef(repoPath));
    await markUncommittedLines(repoPath, headSha, files);

    const newFile = files.find(f => f.newPath === "new.txt")!;
    const addLines = newFile.hunks.flatMap(h => h.lines).filter(l => l.type === "add");
    expect(addLines.every(l => l.uncommitted)).toBe(true);
  });

  it("markUncommittedLines is a no-op when the file has no uncommitted changes", async () => {
    const baseRef = await resolveBaseRef(repoPath);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\ntwo\ncommitted\n");
    await git(repoPath, ["commit", "-am", "committed change"]);
    const headSha = await resolveHeadSha(repoPath);

    const files = await computeDiffIncludingUncommitted(repoPath, baseRef);
    await markUncommittedLines(repoPath, headSha, files);

    const addLines = files.flatMap(f => f.hunks).flatMap(h => h.lines).filter(l => l.type === "add");
    expect(addLines.every(l => !l.uncommitted)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readWorkingTreeFile, readFileAtRef } from "./fileContent.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}

describe("fileContent", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-file-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "committed line\n");
    await git(repoPath, ["add", "a.txt"]);
    await git(repoPath, ["commit", "-m", "base"]);
    await fs.writeFile(path.join(repoPath, "a.txt"), "committed line\nworking line\n");
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("reads current working-tree contents", async () => {
    expect(await readWorkingTreeFile(repoPath, "a.txt")).toEqual(["committed line", "working line", ""]);
  });

  it("reads file contents at a specific ref", async () => {
    expect(await readFileAtRef(repoPath, "HEAD", "a.txt")).toEqual(["committed line"]);
  });
});

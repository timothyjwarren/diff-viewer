import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unchangedFiles, untrackedFiles } from "./unchanged.js";
import type { DiffFile, ScopeEntry } from "../types.js";

const execFileAsync = promisify(execFile);
async function git(cwd: string, args: string[]) {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

describe("unchangedFiles", () => {
  let repoPath: string;
  const file = (p: string): ScopeEntry => ({ repoPath, path: p, kind: "file" });

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-unchanged-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "lib.sh"), "one\ntwo\nthree\n");
    await fs.writeFile(path.join(repoPath, "my file.sh"), "spaced\n");
    await fs.writeFile(path.join(repoPath, "bin.dat"), Buffer.from([1, 0, 2]));
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("turns an untouched file into one all-context hunk numbered on both sides", async () => {
    const [f] = await unchangedFiles(repoPath, [file("lib.sh")], [], "uncommitted");
    expect(f).toEqual({
      repoPath, oldPath: "lib.sh", newPath: "lib.sh", status: "unchanged",
      hunks: [{
        oldStart: 1, oldLines: 3, newStart: 1, newLines: 3,
        lines: [
          { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "one" },
          { type: "context", oldLineNumber: 2, newLineNumber: 2, content: "two" },
          { type: "context", oldLineNumber: 3, newLineNumber: 3, content: "three" },
        ],
      }],
    });
  });

  it("reads a commit's contents for a sha ref", async () => {
    const sha = await git(repoPath, ["rev-parse", "HEAD"]);
    await fs.writeFile(path.join(repoPath, "lib.sh"), "edited\n");
    const [f] = await unchangedFiles(repoPath, [file("lib.sh")], [], sha);
    expect(f.hunks[0].lines.map(l => l.content)).toEqual(["one", "two", "three"]);
  });

  it("leaves out files that are already in the diff", async () => {
    const changed = [{ repoPath, oldPath: "lib.sh", newPath: "lib.sh", status: "modified", hunks: [] }] as DiffFile[];
    expect(await unchangedFiles(repoPath, [file("lib.sh")], changed, "uncommitted")).toEqual([]);
  });

  it("leaves out a file deleted on the old side of a diff entry", async () => {
    const changed = [{ repoPath, oldPath: "lib.sh", newPath: "", status: "deleted", hunks: [] }] as DiffFile[];
    expect(await unchangedFiles(repoPath, [file("lib.sh")], changed, "uncommitted")).toEqual([]);
  });

  it("omits a file missing at the ref, and ignores dir entries", async () => {
    expect(await unchangedFiles(repoPath, [file("gone.sh"), { repoPath, path: ".", kind: "dir" }], [], "uncommitted")).toEqual([]);
  });

  it("marks a binary file as skipped", async () => {
    const [f] = await unchangedFiles(repoPath, [file("bin.dat")], [], "uncommitted");
    expect(f).toMatchObject({ status: "unchanged", hunks: [], skipped: "binary" });
  });

  it("handles a file name with a space", async () => {
    const [f] = await unchangedFiles(repoPath, [file("my file.sh")], [], "uncommitted");
    expect(f.newPath).toBe("my file.sh");
    expect(f.hunks[0].lines[0].content).toBe("spaced");
  });
});

describe("untrackedFiles", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-untracked-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "base.txt"), "b\n");
    await fs.writeFile(path.join(repoPath, ".gitignore"), "*.log\n");
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
    await fs.mkdir(path.join(repoPath, "sub"));
    await fs.writeFile(path.join(repoPath, "deploy.sh"), "#!/bin/sh\nrm -rf x\n");
    await fs.writeFile(path.join(repoPath, "sub", "new.sh"), "n\n");
    await fs.writeFile(path.join(repoPath, "sub", "noise.log"), "n\n");
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("shows an untracked scoped file as added, every line an addition", async () => {
    const files = await untrackedFiles(repoPath, [{ repoPath, path: "deploy.sh", kind: "file" }]);
    expect(files).toEqual([{
      repoPath, oldPath: "", newPath: "deploy.sh", status: "added",
      hunks: [{
        oldStart: 0, oldLines: 0, newStart: 1, newLines: 2,
        lines: [
          { type: "add", oldLineNumber: null, newLineNumber: 1, content: "#!/bin/sh" },
          { type: "add", oldLineNumber: null, newLineNumber: 2, content: "rm -rf x" },
        ],
      }],
    }]);
  });

  it("lists untracked files under a scoped directory, skipping ignored ones", async () => {
    const files = await untrackedFiles(repoPath, [{ repoPath, path: "sub", kind: "dir" }]);
    expect(files.map(f => f.newPath)).toEqual(["sub/new.sh"]);
  });

  it("returns nothing for tracked files or no entries", async () => {
    expect(await untrackedFiles(repoPath, [{ repoPath, path: "base.txt", kind: "file" }])).toEqual([]);
    expect(await untrackedFiles(repoPath, [])).toEqual([]);
  });
});

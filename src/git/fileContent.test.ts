import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readWorkingTreeFile,
  readFileAtRef,
  readFileForView,
  isRepoRelativePath,
  isSafeRef,
  isWorkingTreeRef,
  MAX_VIEW_BYTES,
} from "./fileContent.js";

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

  it("readFileAtRef refuses a ref that git would parse as an option", async () => {
    const target = path.join(repoPath, "pwned");
    await expect(readFileAtRef(repoPath, `--output=${target}`, "a.txt")).rejects.toThrow();
    await expect(fs.access(target)).rejects.toThrow();
  });
});

describe("path and ref predicates", () => {
  it("isRepoRelativePath rejects hostile paths and accepts repo-relative ones", () => {
    for (const bad of ["/etc/passwd", "a/../b", "..\\x", "a\0b", ".."]) expect(isRepoRelativePath(bad)).toBe(false);
    for (const ok of ["", "a/b.ts", "a..b/c"]) expect(isRepoRelativePath(ok)).toBe(true);
  });

  it("isSafeRef rejects empty and dash-prefixed refs", () => {
    expect(isSafeRef("--output=x")).toBe(false);
    expect(isSafeRef("")).toBe(false);
    expect(isSafeRef("abc123")).toBe(true);
  });

  it("isWorkingTreeRef is true for working and uncommitted only", () => {
    expect(isWorkingTreeRef("working")).toBe(true);
    expect(isWorkingTreeRef("uncommitted")).toBe(true);
    expect(isWorkingTreeRef("HEAD")).toBe(false);
  });
});

describe("readFileForView", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-view-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.writeFile(path.join(repoPath, "t.txt"), "a\nb\n");
    await fs.writeFile(path.join(repoPath, "empty.txt"), "");
    await fs.writeFile(path.join(repoPath, "bin.dat"), Buffer.from([65, 0, 66]));
    await fs.writeFile(path.join(repoPath, "big.txt"), Buffer.alloc(MAX_VIEW_BYTES + 1, 97));
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("returns lines at a commit ref and at uncommitted", async () => {
    expect(await readFileForView(repoPath, "HEAD", "t.txt")).toEqual({ lines: ["a", "b"] });
    expect(await readFileForView(repoPath, "uncommitted", "t.txt")).toEqual({ lines: ["a", "b"] });
  });

  it("returns a single empty line for an empty file", async () => {
    expect(await readFileForView(repoPath, "HEAD", "empty.txt")).toEqual({ lines: [""] });
    expect(await readFileForView(repoPath, "uncommitted", "empty.txt")).toEqual({ lines: [""] });
  });

  it("skips binary and too-large files at both ref kinds", async () => {
    for (const ref of ["HEAD", "uncommitted"]) {
      expect(await readFileForView(repoPath, ref, "bin.dat")).toEqual({ skipped: "binary" });
      expect(await readFileForView(repoPath, ref, "big.txt")).toEqual({ skipped: "too-large" });
    }
  });

  it("throws for a missing path", async () => {
    await expect(readFileForView(repoPath, "HEAD", "nope.txt")).rejects.toThrow();
    await expect(readFileForView(repoPath, "uncommitted", "nope.txt")).rejects.toThrow();
  });
});

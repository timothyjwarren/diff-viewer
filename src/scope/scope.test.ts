import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveScopePaths, entriesFor, pathspecArgs, matchesScope, remapScope, inferRepoRoots } from "./scope.js";
import type { RepoConfig, ScopeEntry } from "../types.js";

const execFileAsync = promisify(execFile);
async function git(cwd: string, args: string[]) {
  return (await execFileAsync("git", args, { cwd })).stdout;
}

async function makeRepo(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);
}

describe("scope", () => {
  let root: string;
  let repoPath: string;
  let repo: RepoConfig;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "dv-scope-")));
    repoPath = path.join(root, "r");
    await makeRepo(repoPath);
    await fs.writeFile(path.join(repoPath, "a.txt"), "one\n");
    await fs.mkdir(path.join(repoPath, "sub"));
    await fs.writeFile(path.join(repoPath, "sub", "x.sh"), "echo\n");
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
    const baseRef = (await git(repoPath, ["rev-parse", "HEAD"])).trim();
    repo = { path: repoPath, name: "r", branch: "main", baseRef };
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("resolves files and directories relative to cwd", async () => {
    expect(await resolveScopePaths(["a.txt", "sub/"], [repo], repoPath)).toEqual([
      { repoPath, path: "a.txt", kind: "file" },
      { repoPath, path: "sub", kind: "dir" },
    ]);
  });

  it("resolves a relative path from a subdirectory against that subdirectory", async () => {
    expect(await resolveScopePaths(["./x.sh"], [repo], path.join(repoPath, "sub"))).toEqual([
      { repoPath, path: "sub/x.sh", kind: "file" },
    ]);
  });

  it("treats a directory on disk as a dir entry even without a trailing slash, and the repo root as '.'", async () => {
    expect(await resolveScopePaths(["sub", repoPath], [repo], repoPath)).toEqual([
      { repoPath, path: "sub", kind: "dir" },
      { repoPath, path: ".", kind: "dir" },
    ]);
  });

  it("collapses duplicate entries", async () => {
    expect(await resolveScopePaths(["a.txt", "./a.txt"], [repo], repoPath)).toHaveLength(1);
  });

  it("assigns a path to the deepest containing repo", async () => {
    const innerPath = path.join(repoPath, "inner");
    await makeRepo(innerPath);
    await fs.writeFile(path.join(innerPath, "i.txt"), "i\n");
    const inner: RepoConfig = { path: innerPath, name: "inner", branch: "main", baseRef: "HEAD" };
    expect(await resolveScopePaths([path.join(innerPath, "i.txt")], [repo, inner], root)).toEqual([
      { repoPath: innerPath, path: "i.txt", kind: "file" },
    ]);
  });

  it("rejects a path outside every session repo", async () => {
    await expect(resolveScopePaths([path.join(root, "elsewhere", "x")], [repo], root)).rejects.toThrow(/Not inside any session repo/);
  });

  it("rejects a path that exists nowhere", async () => {
    await expect(resolveScopePaths(["nope.txt"], [repo], repoPath)).rejects.toThrow(/No such file/);
  });

  it("accepts a file deleted from the working tree that still exists at HEAD", async () => {
    await fs.rm(path.join(repoPath, "a.txt"));
    expect(await resolveScopePaths(["a.txt"], [repo], repoPath)).toEqual([{ repoPath, path: "a.txt", kind: "file" }]);
  });

  it("accepts a file that only exists at the diff base", async () => {
    await git(repoPath, ["rm", "-q", "a.txt"]);
    await git(repoPath, ["commit", "-qm", "drop a"]);
    expect(await resolveScopePaths(["a.txt"], [repo], repoPath)).toEqual([{ repoPath, path: "a.txt", kind: "file" }]);
  });

  it("accepts a path with spaces", async () => {
    await fs.writeFile(path.join(repoPath, "my file.sh"), "x\n");
    expect(await resolveScopePaths(["my file.sh"], [repo], repoPath)).toEqual([{ repoPath, path: "my file.sh", kind: "file" }]);
  });

  it("matches files exactly and paths under directory entries", () => {
    const dir: ScopeEntry[] = [{ repoPath, path: "sub", kind: "dir" }];
    expect(matchesScope("sub/deep/x.ts", dir)).toBe(true);
    expect(matchesScope("sub", dir)).toBe(true);
    expect(matchesScope("subway.ts", dir)).toBe(false);
    expect(matchesScope("anything/at/all", [{ repoPath, path: ".", kind: "dir" }])).toBe(true);
    const file: ScopeEntry[] = [{ repoPath, path: "a.txt", kind: "file" }];
    expect(matchesScope("a.txt", file)).toBe(true);
    expect(matchesScope("a.txt.bak", file)).toBe(false);
  });

  it("picks the entries of one repo", () => {
    const scope: ScopeEntry[] = [
      { repoPath: "/a", path: "x", kind: "file" },
      { repoPath: "/b", path: "y", kind: "file" },
    ];
    expect(entriesFor(scope, "/b")).toEqual([scope[1]]);
    expect(entriesFor(null, "/b")).toEqual([]);
  });

  it("builds a pathspec that starts with -- and protects odd names", async () => {
    const args = pathspecArgs([{ repoPath, path: "-rf", kind: "file" }, { repoPath, path: ".", kind: "dir" }]);
    expect(args[0]).toBe("--");
    expect(args).toContain(":(literal)-rf");
  });

  it("builds a pathspec from no entries that matches nothing", async () => {
    await fs.writeFile(path.join(repoPath, "a.txt"), "changed\n");
    const args = pathspecArgs([]);
    expect(args[0]).toBe("--");
    expect(await git(repoPath, ["diff", repo.baseRef, ...pathspecArgs([{ repoPath, path: "a.txt", kind: "file" }])])).not.toBe("");
    expect(await git(repoPath, ["diff", repo.baseRef, ...args])).toBe("");
  });

  it("remaps imported entries by repo basename", () => {
    const repos: RepoConfig[] = [
      { path: "/new/r", name: "r", branch: "main", baseRef: "x" },
      { path: "/new/other", name: "other", branch: "main", baseRef: "x" },
    ];
    const kept: ScopeEntry = { repoPath: "/new/other", path: "k", kind: "file" };
    const moved: ScopeEntry = { repoPath: "/old/r", path: "m", kind: "file" };
    const gone: ScopeEntry = { repoPath: "/old/zzz", path: "g", kind: "file" };
    expect(remapScope([kept, moved, gone], repos)).toEqual({
      scope: [kept, { ...moved, repoPath: "/new/r" }],
      dropped: [gone],
    });
    expect(remapScope([gone], repos)).toEqual({ scope: null, dropped: [gone] });
  });

  it("drops an entry whose basename matches more than one repo", () => {
    const repos: RepoConfig[] = [
      { path: "/x/r", name: "r", branch: "main", baseRef: "x" },
      { path: "/y/r", name: "r", branch: "main", baseRef: "x" },
    ];
    const e: ScopeEntry = { repoPath: "/old/r", path: "m", kind: "file" };
    expect(remapScope([e], repos)).toEqual({ scope: null, dropped: [e] });
  });

  it("infers distinct repo roots from file paths", async () => {
    expect(await inferRepoRoots([path.join(repoPath, "a.txt"), path.join(repoPath, "sub", "x.sh")], root)).toEqual([repoPath]);
  });

  it("infers a repo root from a relative path", async () => {
    expect(await inferRepoRoots(["sub/x.sh"], repoPath)).toEqual([repoPath]);
  });
});

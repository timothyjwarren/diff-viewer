import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listTree } from "./tree.js";

const execFileAsync = promisify(execFile);
const git = (cwd: string, args: string[]) => execFileAsync("git", args, { cwd });

describe("listTree", () => {
  let repoPath: string;
  let sha: string;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "dv-tree-"));
    await git(repoPath, ["init", "-b", "main"]);
    await git(repoPath, ["config", "user.email", "test@example.com"]);
    await git(repoPath, ["config", "user.name", "Test"]);
    await fs.mkdir(path.join(repoPath, "src/util"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "zeta.txt"), "z\n");
    await fs.writeFile(path.join(repoPath, "alpha.txt"), "a\n");
    await fs.writeFile(path.join(repoPath, "src/main.ts"), "m\n");
    await fs.writeFile(path.join(repoPath, "src/util/help.ts"), "h\n");
    await fs.writeFile(path.join(repoPath, "gone.txt"), "g\n");
    await fs.writeFile(path.join(repoPath, ".gitignore"), "ignored.txt\n");
    await git(repoPath, ["add", "."]);
    await git(repoPath, ["commit", "-m", "base"]);
    sha = (await git(repoPath, ["rev-parse", "HEAD"])).stdout.trim();
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it("lists dirs before files with changed markers at a commit ref", async () => {
    const entries = await listTree(repoPath, sha, "", new Set(["src/util/help.ts"]));
    expect(entries).toEqual([
      { name: "src", type: "dir", changed: true },
      { name: ".gitignore", type: "file", changed: false },
      { name: "alpha.txt", type: "file", changed: false },
      { name: "gone.txt", type: "file", changed: false },
      { name: "zeta.txt", type: "file", changed: false },
    ]);
    const sub = await listTree(repoPath, sha, "src", new Set(["src/util/help.ts"]));
    expect(sub).toEqual([
      { name: "util", type: "dir", changed: true },
      { name: "main.ts", type: "file", changed: false },
    ]);
  });

  it("uncommitted includes untracked, omits ignored and deleted files", async () => {
    await fs.writeFile(path.join(repoPath, "new.txt"), "n\n");
    await fs.writeFile(path.join(repoPath, "ignored.txt"), "i\n");
    await fs.rm(path.join(repoPath, "gone.txt"));
    const names = (await listTree(repoPath, "uncommitted", "", new Set())).map((e) => e.name);
    expect(names).toContain("new.txt");
    expect(names).not.toContain("ignored.txt");
    expect(names).not.toContain("gone.txt");
    const sub = await listTree(repoPath, "uncommitted", "src", new Set(["src/main.ts"]));
    expect(sub.find((e) => e.name === "main.ts")?.changed).toBe(true);
  });

  it("rejects for a missing dir or a file used as a dir", async () => {
    await expect(listTree(repoPath, sha, "nope", new Set())).rejects.toThrow();
    await expect(listTree(repoPath, sha, "alpha.txt", new Set())).rejects.toThrow();
    await expect(listTree(repoPath, "uncommitted", "nope", new Set())).rejects.toThrow();
  });
});

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { CommitInfo } from "../types.js";

const execFileAsync = promisify(execFile);
const FIELD_SEP = "\x1f";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/**
 * Throws a clear, specific error for a bad repo path instead of letting a git
 * spawn fail later with a cryptic `spawn git ENOENT` (Node reports a
 * nonexistent `cwd` that way, not as a cwd error) that leaves the caller no
 * wiser than "the server didn't start in time".
 */
export async function assertValidRepoPath(repoPath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(repoPath);
  } catch {
    throw new Error(`No such directory: ${repoPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${repoPath}`);
  }
  try {
    await git(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new Error(`Not a git repository: ${repoPath}`);
  }
}

export async function detectDefaultBranch(repoPath: string): Promise<string> {
  try {
    const ref = await git(repoPath, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    return ref.replace("refs/remotes/", "");
  } catch {
    for (const candidate of ["main", "master"]) {
      try {
        await git(repoPath, ["rev-parse", "--verify", candidate]);
        return candidate;
      } catch {
        continue;
      }
    }
    throw new Error(`Could not detect default branch for ${repoPath}`);
  }
}

export async function resolveMergeBase(repoPath: string, baseBranch: string): Promise<string> {
  return git(repoPath, ["merge-base", "HEAD", baseBranch]);
}

export async function resolveBaseRef(repoPath: string, explicitBaseRef?: string): Promise<string> {
  if (explicitBaseRef) {
    return git(repoPath, ["rev-parse", explicitBaseRef]);
  }
  const defaultBranch = await detectDefaultBranch(repoPath);
  return resolveMergeBase(repoPath, defaultBranch);
}

export async function resolveHeadSha(repoPath: string): Promise<string> {
  return git(repoPath, ["rev-parse", "HEAD"]);
}

/** Repo-relative paths with uncommitted changes (a rename's new path, for a rename). */
export async function listDirtyFiles(repoPath: string): Promise<string[]> {
  // Not routed through the shared git() helper: its stdout.trim() strips the
  // leading space off the first porcelain line only (a clean " M a.txt"
  // becomes "M a.txt"), throwing off the fixed 3-char status-prefix offset
  // below for exactly that one line.
  // -z gives unquoted paths (plain porcelain C-quotes spaces and non-ASCII
  // bytes). Each record is "XY <path>"; a rename or copy is followed by one
  // extra record holding the old path, which is skipped.
  const { stdout } = await execFileAsync("git", ["status", "--porcelain", "-z"], { cwd: repoPath });
  const records = stdout.split("\0");
  const files: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.length < 4) continue;
    files.push(rec.slice(3));
    if (rec[0] === "R" || rec[0] === "C" || rec[1] === "R" || rec[1] === "C") i++;
  }
  return files;
}

export async function isDirty(repoPath: string): Promise<boolean> {
  return (await listDirtyFiles(repoPath)).length > 0;
}

/** The repo's current branch name, or its short HEAD sha when detached. */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  const branch = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "HEAD") return branch;
  return git(repoPath, ["rev-parse", "--short", "HEAD"]);
}

/**
 * Commits strictly ahead of baseRef, oldest first (matches GitHub's PR commit
 * list order). `pathspec` (starting with `--`) keeps only commits touching those paths.
 */
export async function listCommits(repoPath: string, baseRef: string, pathspec: string[] = []): Promise<CommitInfo[]> {
  const format = ["%H", "%h", "%s", "%an", "%aI"].join(FIELD_SEP);
  const log = await git(repoPath, ["log", "--reverse", `--format=${format}`, `${baseRef}..HEAD`, ...pathspec]);
  if (!log) return [];
  return log.split("\n").map(line => {
    const [sha, shortSha, subject, author, date] = line.split(FIELD_SEP);
    return { sha, shortSha, subject, author, date };
  });
}

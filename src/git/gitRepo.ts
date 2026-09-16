import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffFile } from "../types.js";
import { parseUnifiedDiff } from "./diffParser.js";

const execFileAsync = promisify(execFile);

export async function computeDiff(repoPath: string, baseRef: string): Promise<DiffFile[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--no-color", baseRef, "HEAD"], { cwd: repoPath });
  return parseUnifiedDiff(stdout, repoPath);
}

/** Diffs baseRef against the working tree — every committed change plus any uncommitted edits. */
export async function computeDiffIncludingUncommitted(repoPath: string, baseRef: string): Promise<DiffFile[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--no-color", baseRef], { cwd: repoPath });
  return parseUnifiedDiff(stdout, repoPath);
}

/**
 * Diffs the inclusive commit range `from..to`, both committed — unless `to`
 * is the `"uncommitted"` sentinel, in which case it diffs against the
 * working tree instead of a commit.
 */
export async function computeRangeDiff(repoPath: string, from: string, to: string): Promise<DiffFile[]> {
  const fromArg = from === "uncommitted" ? "HEAD" : `${from}^`;
  const args = to === "uncommitted" ? ["diff", "--no-color", fromArg] : ["diff", "--no-color", fromArg, to];
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath });
  return parseUnifiedDiff(stdout, repoPath);
}

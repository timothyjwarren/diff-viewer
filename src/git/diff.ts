import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffFile } from "../types.js";
import { parseUnifiedDiff } from "./diffParser.js";

const execFileAsync = promisify(execFile);

export async function computeDiff(repoPath: string, baseRef: string): Promise<DiffFile[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--no-color", baseRef], { cwd: repoPath });
  return parseUnifiedDiff(stdout, repoPath);
}

/** Diffs the inclusive commit range `from..to` (both committed, no working-tree changes). */
export async function computeRangeDiff(repoPath: string, from: string, to: string): Promise<DiffFile[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--no-color", `${from}^`, to], { cwd: repoPath });
  return parseUnifiedDiff(stdout, repoPath);
}

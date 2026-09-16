import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffFile } from "../types.js";
import { parseUnifiedDiff } from "./diffParser.js";

const execFileAsync = promisify(execFile);

export async function computeDiff(repoPath: string, baseRef: string): Promise<DiffFile[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--no-color", baseRef], { cwd: repoPath });
  return parseUnifiedDiff(stdout, repoPath);
}

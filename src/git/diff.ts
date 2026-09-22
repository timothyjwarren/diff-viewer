import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { diffLines } from "diff";
import type { DiffFile } from "../types.js";
import { parseUnifiedDiff } from "./diffParser.js";
import { readFileAtRef, readWorkingTreeFile, linesToContent } from "./fileContent.js";

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

/**
 * Flags, in place, exactly which "add" lines in `files` exist only in the
 * uncommitted working tree and not at `headSha` — so the UI can highlight
 * just the uncommitted portion of a file instead of the whole file, even
 * when the file also has older, already-committed additions.
 */
export async function markUncommittedLines(repoPath: string, headSha: string, files: DiffFile[]): Promise<void> {
  for (const file of files) {
    const relPath = file.newPath || file.oldPath;
    let headContent: string;
    try {
      headContent = linesToContent(await readFileAtRef(repoPath, headSha, relPath));
    } catch {
      headContent = ""; // file doesn't exist at HEAD yet (uncommitted-new)
    }
    let workingContent: string;
    try {
      workingContent = linesToContent(await readWorkingTreeFile(repoPath, relPath));
    } catch {
      continue; // file doesn't exist in the working tree (uncommitted-deleted) — no "add" lines to flag
    }
    if (headContent === workingContent) continue;

    const uncommittedNewLines = new Set<number>();
    let newLine = 1;
    for (const part of diffLines(headContent, workingContent)) {
      const count = part.count ?? 0;
      if (part.removed) continue;
      if (part.added) {
        for (let i = 0; i < count; i++) uncommittedNewLines.add(newLine + i);
      }
      newLine += count;
    }

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add" && line.newLineNumber != null && uncommittedNewLines.has(line.newLineNumber)) {
          line.uncommitted = true;
        }
      }
    }
  }
}

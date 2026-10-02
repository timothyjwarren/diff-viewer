import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function readWorkingTreeFile(repoPath: string, relativePath: string): Promise<string[]> {
  const content = await fs.readFile(path.join(repoPath, relativePath), "utf-8");
  return content.split("\n");
}

export async function readFileAtRef(repoPath: string, ref: string, relativePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["show", `${ref}:${relativePath}`], { cwd: repoPath });
  return stdout.replace(/\n$/, "").split("\n");
}

/**
 * Like `readWorkingTreeFile`, but a file that isn't on disk reads as empty
 * rather than throwing — a file deleted from the working tree has no
 * content to snapshot, yet its old-side lines can still carry comments.
 */
export async function readWorkingTreeFileOrEmpty(repoPath: string, relativePath: string): Promise<string[]> {
  try {
    return await readWorkingTreeFile(repoPath, relativePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Like `readFileAtRef`, but a path that doesn't exist at `ref` reads as empty
 * rather than throwing (`git show` exits 128 for a missing path) — a file
 * deleted by `ref` has no content to snapshot, yet its old-side lines can
 * still carry comments.
 */
export async function readFileAtRefOrEmpty(repoPath: string, ref: string, relativePath: string): Promise<string[]> {
  try {
    return await readFileAtRef(repoPath, ref, relativePath);
  } catch (err) {
    if ((err as { code?: unknown }).code === 128) return [];
    throw err;
  }
}

/**
 * Joins a lines array back into file content, normalizing away the trailing
 * empty element `readWorkingTreeFile` leaves for a file ending in a
 * newline — `readFileAtRef` never has one, since it strips the trailing
 * newline before splitting. Without this, comparing content read via the
 * two functions spuriously looks changed on the last line.
 *
 * Always ends with a single trailing newline (when non-empty), rather than
 * stripping it: `diffLines` (used for drift-tracking and uncommitted-line
 * detection) tokenizes each line together with its line ending, so a final
 * line without one is a different token from the same text appearing
 * mid-string elsewhere — comparing two consistently-no-trailing-newline
 * strings still spuriously flags a match on the last line as changed
 * whenever it's no longer last on the other side.
 */
export function linesToContent(lines: string[]): string {
  const trimmed = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  return trimmed.length === 0 ? "" : trimmed.join("\n") + "\n";
}

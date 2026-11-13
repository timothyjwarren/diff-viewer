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
  // `git show` would parse a leading "-" as an option (e.g. --output=<path>).
  if (ref.startsWith("-")) throw new Error(`Invalid ref: ${ref}`);
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

export function isWorkingTreeRef(ref: string): boolean {
  return ref === "working" || ref === "uncommitted";
}

export function isSafeRef(ref: string): boolean {
  return ref.length > 0 && !ref.startsWith("-");
}

/** True for a repo-relative path with no `..` segment, no NUL; "" is the repo root. */
export function isRepoRelativePath(p: string): boolean {
  if (p.includes("\0")) return false;
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return false;
  return !p.split(/[/\\]/).includes("..");
}

export const MAX_VIEW_BYTES = 1024 * 1024;

export type ViewResult = { lines: string[] } | { skipped: "binary" | "too-large" };

/**
 * Reads a file for the browser: lines, or a reason the content isn't shown.
 * Working-tree refs read from disk, others via `git show`. Throws if the path
 * is missing or isn't a regular file.
 */
export async function readFileForView(repoPath: string, ref: string, relPath: string): Promise<ViewResult> {
  let buf: Buffer;
  if (isWorkingTreeRef(ref)) {
    const full = path.join(repoPath, relPath);
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error(`Not a file: ${relPath}`);
    if (stat.size > MAX_VIEW_BYTES) return { skipped: "too-large" };
    buf = await fs.readFile(full);
  } else {
    if (!isSafeRef(ref)) throw new Error(`Invalid ref: ${ref}`);
    const spec = `${ref}:${relPath}`;
    const type = (await execFileAsync("git", ["cat-file", "-t", spec], { cwd: repoPath })).stdout.trim();
    if (type !== "blob") throw new Error(`Not a file: ${relPath}`);
    const size = Number((await execFileAsync("git", ["cat-file", "-s", spec], { cwd: repoPath })).stdout.trim());
    if (size > MAX_VIEW_BYTES) return { skipped: "too-large" };
    buf = (
      await execFileAsync("git", ["show", spec], { cwd: repoPath, encoding: "buffer", maxBuffer: MAX_VIEW_BYTES + 1024 })
    ).stdout;
  }
  if (buf.subarray(0, 8000).includes(0)) return { skipped: "binary" };
  return { lines: buf.toString("utf-8").replace(/\n$/, "").split("\n") };
}

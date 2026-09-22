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
 * Joins a lines array back into file content, normalizing away the trailing
 * empty element `readWorkingTreeFile` leaves for a file ending in a
 * newline — `readFileAtRef` never has one, since it strips the trailing
 * newline before splitting. Without this, comparing content read via the
 * two functions spuriously looks changed on the last line.
 */
export function linesToContent(lines: string[]): string {
  const trimmed = lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  return trimmed.join("\n");
}

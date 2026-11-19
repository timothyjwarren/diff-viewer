import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffFile, ScopeEntry } from "../types.js";
import { readFileForView } from "../git/fileContent.js";
import { pathspecArgs } from "./scope.js";

const execFileAsync = promisify(execFile);

async function lsFiles(repoPath: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z", ...args], { cwd: repoPath });
  return stdout.split("\0").filter(Boolean);
}

/**
 * Full-contents entries for scoped files with no changes in the range: each
 * file entry of `entries` that isn't in `changed` and exists at `toRef` (a
 * sha, or "uncommitted"/"working" for the working tree).
 */
export async function unchangedFiles(repoPath: string, entries: ScopeEntry[], changed: DiffFile[], toRef: string): Promise<DiffFile[]> {
  const shown = new Set(changed.flatMap(f => [f.newPath, f.oldPath]).filter(Boolean));
  const out: DiffFile[] = [];
  for (const entry of entries) {
    if (entry.kind !== "file" || shown.has(entry.path)) continue;
    let view;
    try {
      view = await readFileForView(repoPath, toRef, entry.path);
    } catch {
      continue;
    }
    const base = { repoPath, oldPath: entry.path, newPath: entry.path, status: "unchanged" as const };
    if ("skipped" in view) {
      out.push({ ...base, hunks: [], skipped: view.skipped });
      continue;
    }
    const n = view.lines.length;
    out.push({
      ...base,
      hunks: [{
        oldStart: 1, oldLines: n, newStart: 1, newLines: n,
        lines: view.lines.map((content, i) => ({ type: "context", oldLineNumber: i + 1, newLineNumber: i + 1, content })),
      }],
    });
  }
  return out;
}

/**
 * Untracked working-tree files in the scope, as "added" entries. `git diff`
 * leaves untracked files out, but a scoped file the agent just created is
 * exactly what the reviewer needs to see. Under a directory entry, ignored
 * files are skipped; a file entry is shown even if ignored.
 */
export async function untrackedFiles(repoPath: string, entries: ScopeEntry[]): Promise<DiffFile[]> {
  if (entries.length === 0) return [];
  const fileEntries = entries.filter(e => e.kind === "file");
  const dirEntries = entries.filter(e => e.kind === "dir");
  const paths = new Set<string>();
  if (dirEntries.length > 0) {
    for (const p of await lsFiles(repoPath, ["--others", "--exclude-standard", ...pathspecArgs(dirEntries)])) paths.add(p);
  }
  if (fileEntries.length > 0) {
    for (const p of await lsFiles(repoPath, ["--others", ...pathspecArgs(fileEntries)])) paths.add(p);
  }
  const out: DiffFile[] = [];
  for (const p of [...paths].sort()) {
    let view;
    try {
      view = await readFileForView(repoPath, "working", p);
    } catch {
      continue;
    }
    const base = { repoPath, oldPath: "", newPath: p, status: "added" as const };
    if ("skipped" in view) {
      out.push({ ...base, hunks: [], skipped: view.skipped });
      continue;
    }
    const lines = view.lines.length === 1 && view.lines[0] === "" ? [] : view.lines;
    out.push({
      ...base,
      hunks: lines.length === 0 ? [] : [{
        oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length,
        lines: lines.map((content, i) => ({ type: "add", oldLineNumber: null, newLineNumber: i + 1, content })),
      }],
    });
  }
  return out;
}

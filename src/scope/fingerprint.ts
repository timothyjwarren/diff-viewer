import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ScopeEntry, ScopeState } from "../types.js";
import { isWorkingTreeRef } from "../git/fileContent.js";
import { pathspecArgs } from "./scope.js";
import { listUntracked } from "./unchanged.js";

const execFileAsync = promisify(execFile);

async function gitZ(repoPath: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath });
  return stdout.split("\0").filter(Boolean);
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Content fingerprints of a repo's scoped files at `toRef` ("uncommitted" or
 * "working" for the working tree, else a commit): git blob ids, so content
 * committed unchanged keeps its fingerprint. Covers every file entry and every
 * path under the scope that differs from `baseRef`.
 */
export async function scopeFingerprints(repoPath: string, baseRef: string, entries: ScopeEntry[], toRef: string): Promise<ScopeState> {
  const working = isWorkingTreeRef(toRef);
  const ps = pathspecArgs(entries);
  const diffed = await gitZ(repoPath, ["diff", "--name-only", "-z", baseRef, ...(working ? [] : [toRef]), ...ps]);
  const untracked = working ? await listUntracked(repoPath, entries) : [];
  const changed = [...new Set([...diffed, ...untracked])].sort();
  const paths = [...new Set([...entries.filter(e => e.kind === "file").map(e => e.path), ...changed])];
  const files: Record<string, string | null> = Object.fromEntries(paths.map(p => [p, null]));
  if (paths.length === 0) return { files, changed };

  if (working) {
    const existing: string[] = [];
    for (const p of paths) if (await isFile(path.join(repoPath, p))) existing.push(p);
    if (existing.length > 0) {
      const { stdout } = await execFileAsync("git", ["hash-object", "--", ...existing], { cwd: repoPath });
      stdout.trim().split("\n").forEach((hash, i) => { files[existing[i]] = hash; });
    }
  } else {
    const literal = paths.map(p => ({ repoPath, path: p, kind: "file" as const }));
    for (const rec of await gitZ(repoPath, ["ls-tree", "-r", "-z", toRef, ...pathspecArgs(literal)])) {
      const tab = rec.indexOf("\t");
      const [, type, sha] = rec.slice(0, tab).split(" ");
      const p = rec.slice(tab + 1);
      if (type === "blob" && p in files) files[p] = sha;
    }
  }
  return { files, changed };
}

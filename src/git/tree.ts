import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isSafeRef, isWorkingTreeRef } from "./fileContent.js";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;

export interface TreeEntry {
  name: string;
  type: "file" | "dir";
  changed: boolean;
}

function isChanged(fullPath: string, type: "file" | "dir", changedPaths: ReadonlySet<string>): boolean {
  if (type === "file") return changedPaths.has(fullPath);
  const prefix = fullPath + "/";
  for (const p of changedPaths) if (p.startsWith(prefix)) return true;
  return false;
}

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return entries.sort((a, b) =>
    a.type === b.type ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.type === "dir" ? -1 : 1,
  );
}

/**
 * Immediate children of `dir` ("" = root) at `ref`: directories first, then
 * files, each alphabetical. Throws if `dir` doesn't exist at `ref`.
 */
export async function listTree(
  repoPath: string,
  ref: string,
  dir: string,
  changedPaths: ReadonlySet<string>,
): Promise<TreeEntry[]> {
  const dirPrefix = dir === "" ? "" : dir.replace(/\/+$/, "") + "/";
  const entries: TreeEntry[] = [];

  if (isWorkingTreeRef(ref)) {
    const run = async (args: string[]) =>
      (await execFileAsync("git", args, { cwd: repoPath, maxBuffer: MAX_BUFFER })).stdout.split("\0").filter(Boolean);
    const all = await run(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    const deleted = new Set(await run(["ls-files", "-z", "--deleted"]));
    const seen = new Map<string, "file" | "dir">();
    for (const p of all) {
      if (deleted.has(p) || !p.startsWith(dirPrefix)) continue;
      const rest = p.slice(dirPrefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) seen.set(rest, "file");
      else seen.set(rest.slice(0, slash), "dir");
    }
    if (dirPrefix !== "" && seen.size === 0) throw new Error(`No such directory: ${dir}`);
    for (const [name, type] of seen) entries.push({ name, type, changed: isChanged(dirPrefix + name, type, changedPaths) });
  } else {
    if (!isSafeRef(ref)) throw new Error(`Invalid ref: ${ref}`);
    // "ref:" lists the root; "ref:dir/" lists dir's children.
    const { stdout } = await execFileAsync("git", ["ls-tree", "-z", `${ref}:${dirPrefix}`], {
      cwd: repoPath,
      maxBuffer: MAX_BUFFER,
    });
    for (const rec of stdout.split("\0").filter(Boolean)) {
      const tab = rec.indexOf("\t");
      const [mode, objType] = rec.slice(0, tab).split(" ");
      const name = rec.slice(tab + 1);
      if (mode === "160000") continue; // submodule
      const type = objType === "tree" ? "dir" : "file";
      entries.push({ name, type, changed: isChanged(dirPrefix + name, type, changedPaths) });
    }
  }
  return sortEntries(entries);
}

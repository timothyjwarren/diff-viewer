import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RepoConfig, ScopeEntry } from "../types.js";

const execFileAsync = promisify(execFile);

/** Realpath of `p`, or of its deepest existing ancestor joined with the rest, so a deleted file still resolves. */
async function realpathLoose(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(await realpathLoose(parent), path.basename(p));
  }
}

function isInside(root: string, p: string): string | null {
  const rel = path.relative(root, p);
  if (rel === "") return ".";
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

async function existsInGit(repoPath: string, ref: string, rel: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${ref}:${rel}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

async function statOrNull(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

/**
 * Resolves CLI paths (absolute or relative to `cwd`) to scope entries, each in
 * the deepest session repo that contains it. Throws naming the first path that
 * lies outside every repo or exists nowhere.
 */
export async function resolveScopePaths(paths: string[], repos: RepoConfig[], cwd: string): Promise<ScopeEntry[]> {
  const repoReals = await Promise.all(repos.map(async r => ({ repo: r, real: await realpathLoose(r.path) })));
  const out: ScopeEntry[] = [];
  for (const raw of paths) {
    const abs = await realpathLoose(path.resolve(cwd, raw));
    let best: { repo: RepoConfig; rel: string; depth: number } | null = null;
    for (const { repo, real } of repoReals) {
      const rel = isInside(real, abs);
      if (rel !== null && (!best || real.length > best.depth)) best = { repo, rel, depth: real.length };
    }
    if (!best) throw new Error(`Not inside any session repo: ${raw}`);
    const { repo, rel } = best;
    const stat = await statOrNull(abs);
    const exists = stat !== null
      || await existsInGit(repo.path, "HEAD", rel)
      || await existsInGit(repo.path, repo.baseRef, rel);
    if (!exists) throw new Error(`No such file at HEAD, in the working tree, or at the diff base: ${raw}`);
    const kind = rel === "." || /[/\\]$/.test(raw) || stat?.isDirectory() ? "dir" : "file";
    if (!out.some(e => e.repoPath === repo.path && e.path === rel)) out.push({ repoPath: repo.path, path: rel, kind });
  }
  return out;
}

export function entriesFor(scope: ScopeEntry[] | null | undefined, repoPath: string): ScopeEntry[] {
  return (scope ?? []).filter(e => e.repoPath === repoPath);
}

/**
 * Git arguments limiting a command to `entries`, starting with `--`. Paths are
 * literal (no wildcards). With no entries, the pathspec matches nothing.
 */
export function pathspecArgs(entries: ScopeEntry[]): string[] {
  if (entries.length === 0) return ["--", ":(exclude)*", "."];
  return ["--", ...entries.map(e => `:(literal)${e.path}`)];
}

export function matchesScope(relPath: string, entries: ScopeEntry[]): boolean {
  return entries.some(e => {
    if (e.kind === "file") return relPath === e.path;
    return e.path === "." || relPath === e.path || relPath.startsWith(`${e.path}/`);
  });
}

/**
 * Keeps entries whose repo is in `repos`, moves the rest to the one repo with
 * the same basename, and drops entries with no single match.
 */
export function remapScope(scope: ScopeEntry[], repos: RepoConfig[]): { scope: ScopeEntry[] | null; dropped: ScopeEntry[] } {
  const kept: ScopeEntry[] = [];
  const dropped: ScopeEntry[] = [];
  for (const e of scope) {
    if (repos.some(r => r.path === e.repoPath)) {
      kept.push(e);
      continue;
    }
    const matches = repos.filter(r => path.basename(r.path) === path.basename(e.repoPath));
    if (matches.length === 1) kept.push({ ...e, repoPath: matches[0].path });
    else dropped.push(e);
  }
  return { scope: kept.length > 0 ? kept : null, dropped };
}

/** The distinct git top-levels containing `paths`, in first-seen order. */
export async function inferRepoRoots(paths: string[], cwd: string): Promise<string[]> {
  const roots: string[] = [];
  for (const raw of paths) {
    const abs = path.resolve(cwd, raw);
    const stat = await statOrNull(abs);
    let dir = stat?.isDirectory() ? abs : path.dirname(abs);
    while (!(await statOrNull(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    let top: string;
    try {
      top = (await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: dir })).stdout.trim();
    } catch {
      throw new Error(`Not inside a git repository: ${raw}`);
    }
    if (!roots.includes(top)) roots.push(top);
  }
  return roots;
}

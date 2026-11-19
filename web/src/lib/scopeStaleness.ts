import type { ScopeState } from "../types";

/**
 * What changed on disk between the scope fingerprints a repo was loaded with
 * and the current ones. `staleFiles` are paths whose contents differ.
 * `repoStale` means the list of files itself is out of date: a path entered
 * or left the diff, or a file appeared or disappeared.
 */
export function compareScopeState(loaded: ScopeState, current: ScopeState): { staleFiles: Set<string>; repoStale: boolean } {
  const staleFiles = new Set<string>();
  let repoStale = loaded.changed.join("\0") !== current.changed.join("\0");
  for (const p of new Set([...Object.keys(loaded.files), ...Object.keys(current.files)])) {
    const before = loaded.files[p] ?? null;
    const after = current.files[p] ?? null;
    if (before === after) continue;
    staleFiles.add(p);
    if (before === null || after === null) repoStale = true;
  }
  return { staleFiles, repoStale };
}

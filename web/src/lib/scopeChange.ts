import type { CommitInfo, CommitRange } from "../types";

/** The range a repo opens on: everything plus uncommitted edits when scoped, committed-only otherwise. */
export function defaultRange(scoped: boolean): CommitRange | null {
  return scoped ? { from: "", to: "uncommitted" } : null;
}

/**
 * The range to keep after the scope changes and a repo's commits are
 * relisted: `prev` if every commit it names is still listed, else the default.
 */
export function rangeAfterReload(prev: CommitRange | null, commits: CommitInfo[], scoped: boolean): CommitRange | null {
  if (!prev) return defaultRange(scoped);
  const listed = new Set(commits.map(c => c.sha));
  const fromOk = prev.from === "" || listed.has(prev.from);
  const toOk = prev.to === "uncommitted" || listed.has(prev.to);
  return fromOk && toOk ? prev : defaultRange(scoped);
}

/**
 * What to do when the agent changes the scope. With a comment composer open,
 * reloading could unmount it and lose the draft, so the reload waits: the
 * repos are marked stale and the user reloads once the comment is done.
 */
export function onScopeChange(composerArmed: boolean): "reload" | "defer" {
  return composerArmed ? "defer" : "reload";
}

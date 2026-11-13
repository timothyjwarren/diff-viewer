import type { CommentThread } from "../types";

export interface PartitionContext {
  repoPath: string;
  file: string;
  ref: string;
  headSha: string;
  dirtyFiles: string[];
}

/**
 * Splits a file's live threads into those safe to draw inline at `ref` and a
 * count of those that aren't. A thread's lines track the current HEAD (or the
 * working tree, for `uncommitted`-pinned threads), so they only line up with
 * the page when its ref is that basis.
 */
export function partitionThreads(
  threads: CommentThread[], ctx: PartitionContext,
): { visible: CommentThread[]; hiddenCount: number } {
  const visible: CommentThread[] = [];
  let hiddenCount = 0;
  const dirty = ctx.dirtyFiles.includes(ctx.file);
  for (const t of threads) {
    if (t.repoPath !== ctx.repoPath || t.file !== ctx.file || t.outdated || t.side !== "new") continue;
    // An uncommitted-pinned thread tracks the working tree, which equals HEAD while the file is clean.
    const show = ctx.ref === ctx.headSha
      ? t.pinnedRef !== "uncommitted" || !dirty
      : ctx.ref === "uncommitted"
        ? t.pinnedRef === "uncommitted" || !dirty
        : false;
    if (show) visible.push(t);
    else hiddenCount++;
  }
  return { visible, hiddenCount };
}

import type { CommitInfo, CommitRange } from "../types";

export interface CommitRangeState {
  /** The sha a plain click most recently landed on — the start point a shift-click extends from. */
  anchor: string;
  from: string;
  to: string;
}

export function computeRangeClick(
  commits: CommitInfo[],
  current: CommitRangeState | null,
  clickedSha: string,
  shiftKey: boolean,
): CommitRangeState {
  if (!shiftKey || !current) {
    return { anchor: clickedSha, from: clickedSha, to: clickedSha };
  }
  const shas = commits.map(c => c.sha);
  const anchorIdx = shas.indexOf(current.anchor);
  const clickedIdx = shas.indexOf(clickedSha);
  const [fromIdx, toIdx] = anchorIdx <= clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
  return { anchor: current.anchor, from: shas[fromIdx], to: shas[toIdx] };
}

export function isShaInRange(commits: CommitInfo[], range: CommitRange, sha: string): boolean {
  const fromIdx = commits.findIndex(c => c.sha === range.from);
  const toIdx = commits.findIndex(c => c.sha === range.to);
  const idx = commits.findIndex(c => c.sha === sha);
  return idx >= fromIdx && idx <= toIdx;
}

export function rangeCommitCount(commits: CommitInfo[], range: CommitRange): number {
  const fromIdx = commits.findIndex(c => c.sha === range.from);
  const toIdx = commits.findIndex(c => c.sha === range.to);
  return toIdx - fromIdx + 1;
}

import { diffLines } from "diff";
import type { CommentThread } from "../types.js";

export interface DriftInput {
  thread: Pick<CommentThread, "lineStart" | "lineEnd" | "outdated">;
  snapshot: string;
  current: string;
}

export interface DriftResult {
  lineStart: number;
  lineEnd: number;
  outdated: boolean;
}

export function trackThreadDrift({ thread, snapshot, current }: DriftInput): DriftResult {
  if (snapshot === current) {
    return { lineStart: thread.lineStart, lineEnd: thread.lineEnd, outdated: thread.outdated };
  }

  const parts = diffLines(snapshot, current);
  let oldLine = 1;
  let newLine = 1;
  let mappedStart: number | null = null;
  let mappedEnd: number | null = null;
  let touchedByChange = false;

  for (const part of parts) {
    const count = part.count ?? 0;
    if (part.added) {
      newLine += count;
      continue;
    }
    if (part.removed) {
      if (thread.lineStart <= oldLine + count - 1 && thread.lineEnd >= oldLine) touchedByChange = true;
      oldLine += count;
      continue;
    }
    const blockOldStart = oldLine;
    const blockOldEnd = oldLine + count - 1;
    if (thread.lineStart >= blockOldStart && thread.lineStart <= blockOldEnd) {
      mappedStart = newLine + (thread.lineStart - blockOldStart);
    }
    if (thread.lineEnd >= blockOldStart && thread.lineEnd <= blockOldEnd) {
      mappedEnd = newLine + (thread.lineEnd - blockOldStart);
    }
    oldLine += count;
    newLine += count;
  }

  if (touchedByChange || mappedStart === null || mappedEnd === null) {
    return { lineStart: thread.lineStart, lineEnd: thread.lineEnd, outdated: true };
  }
  return { lineStart: mappedStart, lineEnd: mappedEnd, outdated: false };
}

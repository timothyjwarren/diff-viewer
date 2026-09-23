import type { DiffHunk, DiffLine } from "../types";

/** Default reveal size for a single expand click, matching GitHub's own increment. */
export const EXPAND_CHUNK_SIZE = 20;

export function expandHunkContext(
  hunks: DiffHunk[],
  fullFileLines: string[],
  hunkIndex: number,
  direction: "up" | "down",
  amount: number = EXPAND_CHUNK_SIZE,
): DiffHunk[] {
  const hunk = hunks[hunkIndex];
  const result = [...hunks];

  if (direction === "up") {
    const previousHunkEnd = hunkIndex > 0
      ? hunks[hunkIndex - 1].newStart + hunks[hunkIndex - 1].newLines - 1
      : 0;
    const start = Math.max(previousHunkEnd, hunk.newStart - 1 - amount);
    const newLines: DiffLine[] = [];
    for (let ln = start + 1; ln < hunk.newStart; ln++) {
      newLines.push({ type: "context", oldLineNumber: ln, newLineNumber: ln, content: fullFileLines[ln - 1] });
    }
    result[hunkIndex] = {
      ...hunk,
      oldStart: hunk.oldStart - newLines.length,
      newStart: hunk.newStart - newLines.length,
      lines: [...newLines, ...hunk.lines],
    };
  } else {
    const hunkEnd = hunk.newStart + hunk.newLines - 1;
    const nextHunkStart = hunkIndex < hunks.length - 1 ? hunks[hunkIndex + 1].newStart : fullFileLines.length + 1;
    const end = Math.min(nextHunkStart - 1, hunkEnd + amount);
    const newLines: DiffLine[] = [];
    for (let ln = hunkEnd + 1; ln <= end; ln++) {
      newLines.push({ type: "context", oldLineNumber: ln, newLineNumber: ln, content: fullFileLines[ln - 1] });
    }
    result[hunkIndex] = { ...hunk, lines: [...hunk.lines, ...newLines] };
  }

  return result;
}

export interface GapExpansion { hunkIndex: number; direction: "up" | "down"; amount: number; }

/**
 * If `lineNumber` (in the "new"-side numbering `expandHunkContext` already
 * works in) currently falls in a hidden gap around/between hunks, returns
 * the `expandHunkContext` call needed to reveal exactly that line. Returns
 * null if the line is already visible, or there are no hunks.
 */
export function findGapExpansionForLine(hunks: DiffHunk[], lineNumber: number): GapExpansion | null {
  if (hunks.length === 0) return null;

  const first = hunks[0];
  if (lineNumber < first.newStart) {
    return { hunkIndex: 0, direction: "up", amount: first.newStart - lineNumber };
  }

  for (let hi = 0; hi < hunks.length; hi++) {
    const hunk = hunks[hi];
    const hunkEnd = hunk.newStart + hunk.newLines - 1;
    if (lineNumber >= hunk.newStart && lineNumber <= hunkEnd) return null;
    if (lineNumber > hunkEnd) {
      const next = hunks[hi + 1];
      if (!next || lineNumber < next.newStart) {
        return { hunkIndex: hi, direction: "down", amount: lineNumber - hunkEnd };
      }
    }
  }

  return null;
}

/** Number of unchanged lines hidden between the start of the file (or the previous hunk) and this hunk. */
export function hiddenLinesBefore(hunks: DiffHunk[], hunkIndex: number): number {
  const hunk = hunks[hunkIndex];
  const previousHunkEnd = hunkIndex > 0
    ? hunks[hunkIndex - 1].newStart + hunks[hunkIndex - 1].newLines - 1
    : 0;
  return hunk.newStart - 1 - previousHunkEnd;
}

/**
 * Number of unchanged lines hidden between this hunk and the next hunk (always known), or
 * between this hunk and the end of the file when it's the last hunk (only known once
 * `fileLineCount` — the full file's line count — has been loaded; null until then).
 */
export function hiddenLinesAfter(hunks: DiffHunk[], hunkIndex: number, fileLineCount: number | null): number | null {
  const hunk = hunks[hunkIndex];
  const hunkEnd = hunk.newStart + hunk.newLines - 1;
  if (hunkIndex < hunks.length - 1) {
    return hunks[hunkIndex + 1].newStart - 1 - hunkEnd;
  }
  return fileLineCount == null ? null : fileLineCount - hunkEnd;
}

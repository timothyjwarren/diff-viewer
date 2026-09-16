import type { DiffHunk, DiffLine } from "../types";

export function expandHunkContext(
  hunks: DiffHunk[],
  fullFileLines: string[],
  hunkIndex: number,
  direction: "up" | "down",
): DiffHunk[] {
  const hunk = hunks[hunkIndex];
  const result = [...hunks];

  if (direction === "up") {
    const previousHunkEnd = hunkIndex > 0
      ? hunks[hunkIndex - 1].newStart + hunks[hunkIndex - 1].newLines - 1
      : 0;
    const start = Math.max(previousHunkEnd, hunk.newStart - 10);
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
    const end = Math.min(nextHunkStart - 1, hunkEnd + 10);
    const newLines: DiffLine[] = [];
    for (let ln = hunkEnd + 1; ln <= end; ln++) {
      newLines.push({ type: "context", oldLineNumber: ln, newLineNumber: ln, content: fullFileLines[ln - 1] });
    }
    result[hunkIndex] = { ...hunk, lines: [...hunk.lines, ...newLines] };
  }

  return result;
}

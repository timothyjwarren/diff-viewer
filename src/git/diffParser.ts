import type { DiffFile, DiffHunk, DiffLine, FileStatus } from "../types.js";

export function parseUnifiedDiff(diffText: string, repoPath: string): DiffFile[] {
  if (!diffText.trim()) return [];
  const lines = diffText.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const files: DiffFile[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("diff --git")) {
      i++;
      continue;
    }
    i++;

    let oldPath = "";
    let newPath = "";
    let status: FileStatus = "modified";

    while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff --git")) {
      const line = lines[i];
      if (line.startsWith("new file mode")) status = "added";
      else if (line.startsWith("deleted file mode")) status = "deleted";
      else if (line.startsWith("rename from")) {
        status = "renamed";
        oldPath = line.slice("rename from ".length);
      } else if (line.startsWith("rename to")) {
        newPath = line.slice("rename to ".length);
      } else if (line.startsWith("--- ")) {
        const p = line.slice(4);
        oldPath = p === "/dev/null" ? "" : p.replace(/^a\//, "");
      } else if (line.startsWith("+++ ")) {
        const p = line.slice(4);
        newPath = p === "/dev/null" ? "" : p.replace(/^b\//, "");
      }
      i++;
    }

    const hunks: DiffHunk[] = [];
    while (i < lines.length && lines[i].startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
      if (!match) break;
      const oldStart = Number(match[1]);
      const oldLines = match[2] ? Number(match[2]) : 1;
      const newStart = Number(match[3]);
      const newLines = match[4] ? Number(match[4]) : 1;
      i++;

      const hunkLines: DiffLine[] = [];
      let oldLn = oldStart;
      let newLn = newStart;
      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff --git")) {
        const raw = lines[i];
        if (raw.startsWith("\\ No newline")) {
          i++;
          continue;
        }
        const marker = raw[0];
        const content = raw.slice(1);
        if (marker === "+") {
          hunkLines.push({ type: "add", oldLineNumber: null, newLineNumber: newLn, content });
          newLn++;
        } else if (marker === "-") {
          hunkLines.push({ type: "del", oldLineNumber: oldLn, newLineNumber: null, content });
          oldLn++;
        } else {
          hunkLines.push({ type: "context", oldLineNumber: oldLn, newLineNumber: newLn, content });
          oldLn++;
          newLn++;
        }
        i++;
      }
      hunks.push({ oldStart, oldLines, newStart, newLines, lines: hunkLines });
    }

    if (status === "modified" && oldPath === "") status = "added";
    if (status === "modified" && newPath === "") status = "deleted";

    files.push({
      repoPath,
      oldPath: oldPath || newPath,
      newPath: newPath || oldPath,
      status,
      hunks,
    });
  }

  return files;
}

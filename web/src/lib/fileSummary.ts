import type { DiffFile, FileStatus } from "../types";

export const STATUS_LETTER: Record<FileStatus, string> = {
  added: "A", modified: "M", deleted: "D", renamed: "R",
};

export interface DiffStat { added: number; deleted: number; }

export function diffStat(file: DiffFile): DiffStat {
  let added = 0;
  let deleted = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") added++;
      else if (line.type === "del") deleted++;
    }
  }
  return { added, deleted };
}

export function totalDiffStat(files: DiffFile[]): DiffStat {
  return files.map(diffStat).reduce(
    (sum, s) => ({ added: sum.added + s.added, deleted: sum.deleted + s.deleted }),
    { added: 0, deleted: 0 },
  );
}

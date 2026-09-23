import type { DiffFile } from "../types";

export function fileAnchorId(file: DiffFile): string {
  const name = file.newPath || file.oldPath;
  return `file-${(file.repoPath + "-" + name).replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

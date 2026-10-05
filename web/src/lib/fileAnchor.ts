import type { DiffFile } from "../types";

export function fileAnchorIdFor(repoPath: string, name: string): string {
  return `file-${(repoPath + "-" + name).replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

export function fileAnchorId(file: DiffFile): string {
  return fileAnchorIdFor(file.repoPath, file.newPath || file.oldPath);
}

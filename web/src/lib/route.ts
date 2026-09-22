export interface FileViewParams { repoPath: string; filePath: string; gitRef: string; repoName: string; }

export function parseFileViewParams(search: string): FileViewParams {
  const params = new URLSearchParams(search);
  return {
    repoPath: params.get("repoPath") ?? "",
    filePath: params.get("path") ?? "",
    gitRef: params.get("ref") ?? "working",
    repoName: params.get("repoName") ?? "",
  };
}

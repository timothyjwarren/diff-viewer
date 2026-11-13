export interface BrowseParams { repoPath: string; ref: string; path: string; line?: number; }

export function parseBrowseParams(search: string): BrowseParams {
  const params = new URLSearchParams(search);
  const lineRaw = params.get("line");
  const line = lineRaw !== null && /^\d+$/.test(lineRaw) ? Number(lineRaw) : 0;
  return {
    repoPath: params.get("repoPath") ?? "",
    ref: params.get("ref") || "uncommitted",
    path: params.get("path") ?? "",
    ...(line > 0 ? { line } : {}),
  };
}

export function buildBrowseUrl(p: BrowseParams): string {
  const params = new URLSearchParams({ repoPath: p.repoPath, ref: p.ref, path: p.path });
  if (p.line !== undefined) params.set("line", String(p.line));
  return `/view-file?${params}`;
}

/** The browse-URL ref for a git ref used elsewhere in the app: the working tree is "uncommitted". */
export function toBrowseRef(gitRef: string): string {
  return gitRef === "working" || gitRef === "uncommitted" ? "uncommitted" : gitRef;
}

/** One entry per directory segment of a file path, with its cumulative path. */
export function dirLinkSegments(filePath: string): { name: string; dirPath: string }[] {
  const parts = filePath.split("/");
  return parts.slice(0, -1).map((name, i) => ({ name, dirPath: parts.slice(0, i + 1).join("/") }));
}

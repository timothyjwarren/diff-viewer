export interface RepoConfig { path: string; name: string; baseRef: string; }

export interface DiffLine {
  type: "context" | "add" | "del";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}
export interface DiffHunk { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[]; }
export type FileStatus = "added" | "modified" | "deleted" | "renamed";
export interface DiffFile { repoPath: string; oldPath: string; newPath: string; status: FileStatus; hunks: DiffHunk[]; }
export interface RepoDiff { repo: string; branch: string; repoPath: string; files: DiffFile[]; }

export interface CommitInfo {
  sha: string; shortSha: string; subject: string; author: string; date: string;
}
export interface CommitRange { from: string; to: string; }

export type CommentAuthor = "user" | "agent";
export interface Comment {
  id: string; author: CommentAuthor; body: string; suggestion?: string;
  pending: boolean; verdictId?: string; createdAt: string;
}
export interface CommentThread {
  id: string; repoPath: string; file: string; lineStart: number; lineEnd: number;
  side: "old" | "new"; resolved: boolean; comments: Comment[];
}

export type VerdictType = "comment" | "approve" | "request_changes";
export interface Verdict { id: string; type: VerdictType; summary?: string; submittedAt: string; }

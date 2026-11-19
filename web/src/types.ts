export interface RepoConfig { path: string; name: string; baseRef: string; }

export interface DiffLine {
  type: "context" | "add" | "del";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
  /** True for an "add" line that only exists in the uncommitted working tree, not at HEAD. */
  uncommitted?: boolean;
}
export interface DiffHunk { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[]; }
/** "unchanged" is a scoped file with no changes in the range, shown as its full contents. */
export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "unchanged";
export interface DiffFile {
  repoPath: string; oldPath: string; newPath: string; status: FileStatus; hunks: DiffHunk[];
  /** Set on a scoped full-contents file whose contents aren't shown. */
  skipped?: "binary" | "too-large";
}
export interface RepoDiff {
  repo: string; branch: string; repoPath: string; files: DiffFile[];
  /** Whether these files are limited to the session's scope. */
  scoped?: boolean;
}

/** One path of a session's file scope. `path` is repo-relative; "." is the repo root. */
export interface ScopeEntry { repoPath: string; path: string; kind: "file" | "dir"; }
/** Content fingerprints of a repo's scoped files at one ref. */
export interface ScopeState { files: Record<string, string | null>; changed: string[]; }

export interface TreeEntry { name: string; type: "file" | "dir"; changed: boolean; }

export interface CommitInfo {
  sha: string; shortSha: string; subject: string; author: string; date: string;
}
export interface CommitRange { from: string; to: string; }

export type CommentAuthor = "user" | "agent";
export type CommentAgentStatus = "seen" | "acked" | "cleared";
export interface Comment {
  id: string; author: CommentAuthor; body: string; suggestion?: string;
  pending: boolean; verdictId?: string; agentStatus?: CommentAgentStatus;
  /** Set on an agent comment once the user has had it on screen; unset means unread. */
  readByUser?: boolean;
  createdAt: string;
}
export interface CommentThread {
  id: string; repoPath: string; file: string; lineStart: number; lineEnd: number;
  side: "old" | "new"; resolved: boolean; pinnedRef: string | "uncommitted"; outdated: boolean;
  /** Marked by the user to come back to. */
  flagged?: boolean;
  comments: Comment[];
}

export type VerdictType = "comment" | "approve" | "request_changes";
export interface Verdict { id: string; type: VerdictType; summary?: string; submittedAt: string; }

export interface CommentsReplaced { at: string; by: "reset" | "restore"; }
export interface SessionInfo {
  id: string; title: string; description?: string; commentsReplaced?: CommentsReplaced;
  /** The paths the viewer is limited to; null or absent when unscoped. */
  scope?: ScopeEntry[] | null;
}
export type SessionMeta = Pick<SessionInfo, "title" | "description" | "commentsReplaced" | "scope"> & {
  /** Whether an agent is currently waiting on this session's notifications. */
  agentListening: boolean;
};

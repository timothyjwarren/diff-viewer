export interface RepoConfig {
  path: string;
  name: string;
  branch: string;
  baseRef: string;
}

export interface DiffLine {
  type: "context" | "add" | "del";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
  /** True for an "add" line that only exists in the uncommitted working tree, not at HEAD. */
  uncommitted?: boolean;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/** "unchanged" is a scoped file with no changes in the range, shown as its full contents. */
export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "unchanged";

export interface DiffFile {
  repoPath: string;
  oldPath: string;
  newPath: string;
  status: FileStatus;
  hunks: DiffHunk[];
  /** Set on a scoped file shown as full contents (unchanged or untracked) whose contents aren't shown. */
  skipped?: "binary" | "too-large";
}

/** One path of a session's file scope. `path` is repo-relative; "." is the repo root. */
export interface ScopeEntry {
  repoPath: string;
  path: string;
  kind: "file" | "dir";
}

/** Content fingerprints of a repo's scoped files at one ref, for spotting stale views. */
export interface ScopeState {
  /** Fingerprint per path: a blob hash, or null when the file is missing. */
  files: Record<string, string | null>;
  /** Sorted paths under the scope that differ from the diff base. */
  changed: string[];
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: string;
}

export type CommentAuthor = "user" | "agent";

/**
 * Agent-activity indicator for a single (non-pending, immediately-posted)
 * comment. One-way progression, no reverting: unset -> "seen" (automatic,
 * on `diff-viewer review`) -> "acked" (manual, `diff-viewer ack`) ->
 * "cleared" (manual, `diff-viewer unack`, once the agent is done and about
 * to reply). "cleared" is terminal — re-fetching via `review` must not
 * resurrect it back to "seen".
 */
export type CommentAgentStatus = "seen" | "acked" | "cleared";

export interface Comment {
  id: string;
  author: CommentAuthor;
  body: string;
  suggestion?: string;
  /** true = queued in the user's in-progress review, not yet visible to the agent */
  pending: boolean;
  /** set once this comment is bundled into a submitted verdict */
  verdictId?: string;
  agentStatus?: CommentAgentStatus;
  /** Set on an agent comment once the user has had it on screen; unset means unread. */
  readByUser?: boolean;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  repoPath: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  side: "old" | "new";
  resolved: boolean;
  pinnedRef: string | "uncommitted";
  outdated: boolean;
  /** Marked by the user to come back to. */
  flagged?: boolean;
  comments: Comment[];
}

export type VerdictType = "comment" | "approve" | "request_changes";
export type VerdictIntent = "discussion" | "changes_requested";

export interface Verdict {
  id: string;
  type: VerdictType;
  summary?: string;
  submittedAt: string;
}

export interface NotificationEvent {
  id: string;
  type: "comment" | "verdict";
  threadId?: string;
  commentId?: string;
  verdictId?: string;
  createdAt: string;
}

export interface CommentsReplaced {
  at: string;
  by: "reset" | "restore";
}

export interface CommentArchive {
  id: string;
  archivedAt: string;
  threads: CommentThread[];
  verdicts: Verdict[];
  contentSnapshots: Record<string, string>;
}

export interface CommentArchiveSummary {
  id: string;
  archivedAt: string;
  threadCount: number;
  commentCount: number;
  verdictCount: number;
}

export interface SessionData {
  id: string;
  title: string;
  /** Agent-written Markdown overview of what is under review and why, for a reader returning to the session. */
  description?: string;
  /** The last time the agent swapped out the session's comments, via `reset` or `restore`. */
  commentsReplaced?: CommentsReplaced;
  /** Comments set aside by `reset` or `restore`, oldest first. */
  archives?: CommentArchive[];
  repos: RepoConfig[];
  /** Paths the viewer is limited to; null shows every changed file. Never empty. */
  scope?: ScopeEntry[] | null;
  createdAt: string;
  /** Port the server last bound; `resume` reuses it. */
  port?: number;
  status: "active" | "stopped";
  threads: CommentThread[];
  verdicts: Verdict[];
  notifications: NotificationEvent[];
  contentSnapshots: Record<string, string>;
}

export function verdictIntent(type: VerdictType): VerdictIntent {
  return type === "request_changes" ? "changes_requested" : "discussion";
}

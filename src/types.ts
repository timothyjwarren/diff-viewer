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
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffFile {
  repoPath: string;
  oldPath: string;
  newPath: string;
  status: FileStatus;
  hunks: DiffHunk[];
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

export interface SessionData {
  id: string;
  title: string;
  repos: RepoConfig[];
  createdAt: string;
  status: "active" | "stopped";
  threads: CommentThread[];
  verdicts: Verdict[];
  notifications: NotificationEvent[];
}

export function verdictIntent(type: VerdictType): VerdictIntent {
  return type === "request_changes" ? "changes_requested" : "discussion";
}

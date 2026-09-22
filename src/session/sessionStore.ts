import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "../paths.js";
import type {
  SessionData, RepoConfig, CommentThread, Comment, CommentAuthor,
  Verdict, VerdictType, NotificationEvent, VerdictIntent,
} from "../types.js";
import { verdictIntent } from "../types.js";
import { trackThreadDrift } from "./driftTracking.js";

export interface NewThreadInput {
  repoPath: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  side: "old" | "new";
  author: CommentAuthor;
  body: string;
  suggestion?: string;
  pending?: boolean;
  pinnedRef: string;
}

export class SessionStore {
  readonly emitter = new EventEmitter();
  private data: SessionData;
  private filePath: string;

  private constructor(data: SessionData, filePath: string) {
    this.data = data;
    this.filePath = filePath;
    this.emitter.setMaxListeners(0);
  }

  static create(repos: RepoConfig[], id: string, title: string, dataDir: string = getDataDir()): SessionStore {
    const data: SessionData = {
      id, title, repos, createdAt: new Date().toISOString(), status: "active",
      threads: [], verdicts: [], notifications: [], contentSnapshots: {},
    };
    return new SessionStore(data, path.join(dataDir, `${id}.json`));
  }

  static async load(filePath: string): Promise<SessionStore> {
    const raw = await fs.readFile(filePath, "utf-8");
    return new SessionStore(JSON.parse(raw) as SessionData, filePath);
  }

  get id(): string { return this.data.id; }
  get snapshot(): SessionData { return structuredClone(this.data); }
  get notificationCount(): number { return this.data.notifications.length; }

  async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  private notify(event: Omit<NotificationEvent, "id" | "createdAt">): void {
    this.data.notifications.push({ id: randomUUID(), createdAt: new Date().toISOString(), ...event });
    this.emitter.emit("notification");
  }

  addThread(input: NewThreadInput): CommentThread {
    const pending = input.author === "user" ? Boolean(input.pending) : false;
    const comment: Comment = {
      id: randomUUID(), author: input.author, body: input.body, suggestion: input.suggestion,
      pending, createdAt: new Date().toISOString(),
    };
    const thread: CommentThread = {
      id: randomUUID(), repoPath: input.repoPath, file: input.file,
      lineStart: input.lineStart, lineEnd: input.lineEnd, side: input.side,
      resolved: false, pinnedRef: input.pinnedRef, outdated: false, comments: [comment],
    };
    this.data.threads.push(thread);
    if (input.author === "user" && !pending) {
      this.notify({ type: "comment", threadId: thread.id, commentId: comment.id });
    }
    return thread;
  }

  ensureContentSnapshot(pinnedRef: string, file: string, content: string): void {
    const key = `${pinnedRef}:${file}`;
    if (!(key in this.data.contentSnapshots)) {
      this.data.contentSnapshots[key] = content;
    }
  }

  addReply(threadId: string, author: CommentAuthor, body: string, suggestion?: string, pendingInput?: boolean): Comment {
    const thread = this.data.threads.find(t => t.id === threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    const pending = author === "user" ? Boolean(pendingInput) : false;
    const comment: Comment = { id: randomUUID(), author, body, suggestion, pending, createdAt: new Date().toISOString() };
    thread.comments.push(comment);
    if (author === "user" && !pending) {
      this.notify({ type: "comment", threadId: thread.id, commentId: comment.id });
    }
    return comment;
  }

  private findComment(threadId: string, commentId: string): Comment {
    const thread = this.data.threads.find(t => t.id === threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    const comment = thread.comments.find(c => c.id === commentId);
    if (!comment) throw new Error(`Comment not found: ${commentId}`);
    return comment;
  }

  ackComment(threadId: string, commentId: string): void {
    this.findComment(threadId, commentId).agentStatus = "acked";
  }

  /** Terminal: the agent is done processing and about to reply, so no badge should show anymore. */
  unackComment(threadId: string, commentId: string): void {
    this.findComment(threadId, commentId).agentStatus = "cleared";
  }

  /**
   * Marks every never-touched *user* comment as seen — called when the
   * agent fetches the full review state. Only comments with no agentStatus
   * yet are touched, so this can't resurrect an already-"cleared" comment
   * back to "seen", nor downgrade an in-progress "acked" one. Agent-authored
   * comments are never touched — this indicator is for comments the agent
   * needs to read and react to, not its own outgoing replies.
   */
  markAllSeen(): void {
    for (const thread of this.data.threads) {
      for (const comment of thread.comments) {
        if (comment.author === "user" && !comment.agentStatus) comment.agentStatus = "seen";
      }
    }
  }

  editComment(threadId: string, commentId: string, body: string): void {
    const thread = this.data.threads.find(t => t.id === threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    const comment = thread.comments.find(c => c.id === commentId);
    if (!comment) throw new Error(`Comment not found: ${commentId}`);
    comment.body = body;
  }

  deleteComment(threadId: string, commentId: string): void {
    const thread = this.data.threads.find(t => t.id === threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    thread.comments = thread.comments.filter(c => c.id !== commentId);
    if (thread.comments.length === 0) {
      this.data.threads = this.data.threads.filter(t => t.id !== threadId);
    }
  }

  addVerdict(type: VerdictType, summary?: string): Verdict {
    const verdict: Verdict = { id: randomUUID(), type, summary, submittedAt: new Date().toISOString() };
    this.data.verdicts.push(verdict);
    for (const thread of this.data.threads) {
      for (const comment of thread.comments) {
        if (comment.author === "user" && comment.pending) {
          comment.pending = false;
          comment.verdictId = verdict.id;
        }
      }
    }
    this.notify({ type: "verdict", verdictId: verdict.id });
    return verdict;
  }

  getVerdictDetail(verdictId: string): { verdict: Verdict; intent: VerdictIntent; threads: CommentThread[] } {
    const verdict = this.data.verdicts.find(v => v.id === verdictId);
    if (!verdict) throw new Error(`Verdict not found: ${verdictId}`);
    const threads = this.data.threads
      .map(t => ({ ...t, comments: t.comments.filter(c => c.verdictId === verdictId) }))
      .filter(t => t.comments.length > 0);
    return { verdict, intent: verdictIntent(verdict.type), threads };
  }

  notificationsSince(cursor: number): NotificationEvent[] {
    return this.data.notifications.slice(cursor);
  }

  async recomputeThreadPositions(
    repoPath: string,
    headSha: string,
    dirty: boolean,
    readSnapshot: (pinnedRef: string, file: string) => Promise<string>,
    // pinnedRef is passed through so the caller can track a real-sha-pinned
    // thread against committed (HEAD) content only — matching the
    // committed-only view exactly — while an "uncommitted"-pinned thread
    // still tracks the working tree, since that *is* its commit basis until
    // it gets committed and backfilled to a real sha.
    readCurrent: (file: string, side: "old" | "new", pinnedRef: string) => Promise<string>,
  ): Promise<void> {
    // Snapshot advances are staged and applied after the loop, not written
    // as each thread is processed: multiple threads can share a
    // (pinnedRef, file) key, and mutating the cache mid-loop would make a
    // later thread on the same key diff against `current` twice (no-op)
    // instead of once against the original `snapshot`.
    const snapshotAdvances: Record<string, string> = {};

    for (const thread of this.data.threads) {
      if (thread.repoPath !== repoPath || thread.outdated) continue;
      const key = `${thread.pinnedRef}:${thread.file}`;
      if (!(key in this.data.contentSnapshots)) {
        this.data.contentSnapshots[key] = await readSnapshot(thread.pinnedRef, thread.file);
      }
      const snapshot = this.data.contentSnapshots[key];
      const current = await readCurrent(thread.file, thread.side, thread.pinnedRef);
      const result = trackThreadDrift({ thread, snapshot, current });
      thread.lineStart = result.lineStart;
      thread.lineEnd = result.lineEnd;
      thread.outdated = result.outdated;
      if (thread.pinnedRef === "uncommitted" && !dirty && !result.outdated) {
        thread.pinnedRef = headSha;
        snapshotAdvances[`${headSha}:${thread.file}`] = current;
      } else if (!result.outdated) {
        // Advance the cache to the position we just repositioned to, so the
        // next recompute diffs from here instead of re-applying this same
        // shift on top of an already-updated lineStart/lineEnd.
        snapshotAdvances[key] = current;
      }
    }

    Object.assign(this.data.contentSnapshots, snapshotAdvances);
  }
}

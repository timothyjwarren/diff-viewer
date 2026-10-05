import type { DiffFile } from "../types";

/** How the user last set a file's collapsed state by hand, overriding what its reviewed mark implies. */
export type ViewOverride = "collapsed" | "expanded";

export function fileKey(file: DiffFile): string {
  return `${file.repoPath}\n${file.newPath || file.oldPath}`;
}

/**
 * A short digest of what a reviewer reads in a file's diff: its status, its
 * paths, and each added or deleted line. A reviewed mark applies only while
 * this digest is unchanged.
 */
export function diffFingerprint(file: DiffFile): string {
  let hash = 5381;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    hash = ((hash * 33) ^ 10) >>> 0;
  };
  feed(file.status);
  feed(file.oldPath);
  feed(file.newPath);
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type !== "context") feed(line.type + line.content);
    }
  }
  return hash.toString(36);
}

/** A reviewed file is collapsed unless the user expanded it; any file is collapsed if the user collapsed it. */
export function isCollapsed(override: ViewOverride | undefined, reviewed: boolean): boolean {
  return override === "collapsed" || (override !== "expanded" && reviewed);
}

/** The persisted reviewed marks: each file's key mapped to the fingerprint it was reviewed at. */
export interface StoredReviews {
  /** The session's `commentsReplaced.at` when these were saved; marks from before a clear don't apply after it. */
  stamp: string | null;
  files: Record<string, string>;
}

export const reviewedStorageKey = (sessionId: string) => `diff-viewer:reviewed:${sessionId}`;

export function readStoredReviews(sessionId: string): StoredReviews | null {
  try {
    const raw = localStorage.getItem(reviewedStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.files !== "object" || parsed.files === null) return null;
    return { stamp: typeof parsed.stamp === "string" ? parsed.stamp : null, files: parsed.files };
  } catch {
    return null;
  }
}

export function writeStoredReviews(sessionId: string, reviews: StoredReviews): void {
  try {
    localStorage.setItem(reviewedStorageKey(sessionId), JSON.stringify(reviews));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); marks still work for this page.
  }
}

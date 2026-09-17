import type { CommentThread } from "../types";

/** Ids of agent comments present in `current` but not in `previous`. */
export function newAgentCommentIds(previous: CommentThread[], current: CommentThread[]): string[] {
  const previousIds = new Set(previous.flatMap(t => t.comments.map(c => c.id)));
  const result: string[] = [];
  for (const thread of current) {
    for (const comment of thread.comments) {
      if (comment.author === "agent" && !previousIds.has(comment.id)) {
        result.push(comment.id);
      }
    }
  }
  return result;
}

import type { RepoDiff, CommentThread, Verdict, VerdictType } from "../types";

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export async function fetchDiffs(): Promise<RepoDiff[]> {
  return json(await fetch("/api/diffs"));
}

export async function fetchFile(repoPath: string, filePath: string, ref: string): Promise<string[]> {
  const params = new URLSearchParams({ repoPath, path: filePath, ref });
  const data = await json<{ lines: string[] }>(await fetch(`/api/file?${params}`));
  return data.lines;
}

export async function fetchThreads(): Promise<CommentThread[]> {
  return json(await fetch("/api/threads"));
}

export interface NewThreadInput {
  repoPath: string; file: string; lineStart: number; lineEnd: number;
  side: "old" | "new"; body: string; suggestion?: string; pending: boolean;
}

export async function createThread(input: NewThreadInput): Promise<CommentThread> {
  return json(await fetch("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, author: "user" }),
  }));
}

export async function addReply(threadId: string, body: string, pending: boolean, suggestion?: string): Promise<void> {
  await fetch(`/api/threads/${threadId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author: "user", body, pending, suggestion }),
  });
}

export async function editComment(threadId: string, commentId: string, body: string): Promise<void> {
  await fetch(`/api/threads/${threadId}/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function deleteComment(threadId: string, commentId: string): Promise<void> {
  await fetch(`/api/threads/${threadId}/comments/${commentId}`, { method: "DELETE" });
}

export async function fetchVerdicts(): Promise<Verdict[]> {
  return json(await fetch("/api/verdicts"));
}

export async function submitVerdict(type: VerdictType, summary?: string): Promise<Verdict> {
  return json(await fetch("/api/verdicts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, summary }),
  }));
}

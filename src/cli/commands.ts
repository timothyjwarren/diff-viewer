import fs from "node:fs/promises";
import path from "node:path";
import { getRegistryDir, getDataDir } from "../paths.js";
import { readRegistryEntry, removeRegistryEntry } from "../registry.js";
import { readCursor, writeCursor } from "./cursor.js";
import { verdictIntent, type SessionData, type RepoConfig } from "../types.js";

async function baseUrl(sessionId: string): Promise<string> {
  const { port } = await readRegistryEntry(sessionId);
  return `http://127.0.0.1:${port}`;
}

export async function waitCommand(sessionId: string): Promise<{ notifications: unknown[] }> {
  const url = await baseUrl(sessionId);
  const since = await readCursor(sessionId);
  while (true) {
    const res = await fetch(`${url}/api/wait?since=${since}`);
    if (res.status === 200) {
      const body = await res.json() as { notifications: unknown[]; cursor: number };
      await writeCursor(sessionId, body.cursor);
      return { notifications: body.notifications };
    }
    // 204 = server-side long-poll timed out with nothing new; the server holds
    // again on the next call, so just retry.
  }
}

export async function reviewCommand(sessionId: string): Promise<unknown> {
  const url = await baseUrl(sessionId);
  const [threads, verdicts] = await Promise.all([
    fetch(`${url}/api/threads`).then(r => r.json()),
    fetch(`${url}/api/verdicts`).then(r => r.json()),
  ]);
  const verdictsWithIntent = (verdicts as Array<{ type: "comment" | "approve" | "request_changes" }>).map(v => ({
    ...v, intent: verdictIntent(v.type),
  }));
  return { threads, verdicts: verdictsWithIntent };
}

export async function replyCommand(sessionId: string, threadId: string, text: string): Promise<unknown> {
  const url = await baseUrl(sessionId);
  const res = await fetch(`${url}/api/threads/${threadId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author: "agent", body: text }),
  });
  return res.json();
}

export async function commentCommand(
  sessionId: string, repoPath: string, file: string,
  lineStart: number, lineEnd: number, side: "old" | "new", text: string,
): Promise<unknown> {
  const url = await baseUrl(sessionId);
  const res = await fetch(`${url}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath, file, lineStart, lineEnd, side, author: "agent", body: text }),
  });
  return res.json();
}

export async function stopCommand(sessionId: string): Promise<void> {
  const { pid } = await readRegistryEntry(sessionId);
  process.kill(pid, "SIGTERM");
  await removeRegistryEntry(sessionId);
}

export async function sessionsCommand(repoFilter?: string): Promise<Array<{ sessionId: string; repos: RepoConfig[] }>> {
  let entries: string[];
  try {
    entries = await fs.readdir(getRegistryDir());
  } catch {
    return [];
  }
  const sessionIds = entries.filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, ""));
  const results: Array<{ sessionId: string; repos: RepoConfig[] }> = [];
  for (const id of sessionIds) {
    try {
      const raw = await fs.readFile(path.join(getDataDir(), `${id}.json`), "utf-8");
      const data = JSON.parse(raw) as SessionData;
      if (data.status !== "active") continue;
      if (!repoFilter || data.repos.some(r => r.path === repoFilter)) {
        results.push({ sessionId: id, repos: data.repos });
      }
    } catch {
      continue;
    }
  }
  return results;
}

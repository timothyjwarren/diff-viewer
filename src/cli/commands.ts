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

async function registryExists(sessionId: string): Promise<boolean> {
  try {
    await readRegistryEntry(sessionId);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Thrown by waitCommand when the session's registry entry is gone — i.e. `diff-viewer stop` ran. */
class SessionEndedError extends Error {}

const MAX_WAIT_RETRIES = 5;

export async function waitCommand(sessionId: string): Promise<{ notifications: unknown[] }> {
  let url: string;
  try {
    url = await baseUrl(sessionId);
  } catch {
    throw new SessionEndedError();
  }
  const since = await readCursor(sessionId);
  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetch(`${url}/api/wait?since=${since}`);
    } catch (err) {
      // Connection failure could mean the server crashed, or that
      // `diff-viewer stop` killed it intentionally — tell those apart by
      // checking whether the registry entry it removes is still there.
      if (!(await registryExists(sessionId))) throw new SessionEndedError();
      attempt += 1;
      if (attempt > MAX_WAIT_RETRIES) throw err;
      await sleep(Math.min(1000 * attempt, 5000));
      continue;
    }
    if (res.status === 200) {
      const body = await res.json() as { notifications: unknown[]; cursor: number };
      await writeCursor(sessionId, body.cursor);
      return { notifications: body.notifications };
    }
    if (res.status === 204) {
      // Server-side long-poll timed out with nothing new; the server holds
      // again on the next call, so just retry immediately.
      attempt = 0;
      continue;
    }
    // Unexpected status (e.g. a stale/misbehaving server) — back off and retry
    // a bounded number of times rather than busy-spinning forever.
    if (!(await registryExists(sessionId))) throw new SessionEndedError();
    attempt += 1;
    if (attempt > MAX_WAIT_RETRIES) throw new Error(`diff-viewer wait: unexpected status ${res.status}`);
    await sleep(Math.min(1000 * attempt, 5000));
  }
}

/**
 * Loops forever, printing one JSON line per notification as it arrives — built
 * for `Monitor`, which turns each stdout line into a notification. Exits
 * cleanly (after printing a final session_ended line) once `diff-viewer stop`
 * has removed the session's registry entry; exits non-zero if the server
 * becomes unreachable for a reason other than an intentional stop.
 */
export async function watchCommand(sessionId: string, log: (line: string) => void = line => console.log(line)): Promise<void> {
  while (true) {
    let result: { notifications: unknown[] };
    try {
      result = await waitCommand(sessionId);
    } catch (err) {
      if (err instanceof SessionEndedError) {
        log(JSON.stringify({ type: "session_ended" }));
        return;
      }
      throw err;
    }
    for (const notification of result.notifications) {
      log(JSON.stringify(notification));
    }
  }
}

export async function reviewCommand(sessionId: string): Promise<unknown> {
  const url = await baseUrl(sessionId);
  const [threads, verdicts] = await Promise.all([
    fetch(`${url}/api/threads`).then(r => r.json()),
    fetch(`${url}/api/verdicts`).then(r => r.json()),
    // Fetching via `review` is what the agent uses to read comments, so it's
    // what should flip their "seen" flag — the frontend's own polling of
    // /api/threads must NOT trigger this, or every comment would appear
    // seen instantly (before the agent ever looked at it).
    fetch(`${url}/api/mark-seen`, { method: "POST" }),
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

export async function ackCommand(sessionId: string, threadId: string, commentId: string): Promise<void> {
  const url = await baseUrl(sessionId);
  await fetch(`${url}/api/threads/${threadId}/comments/${commentId}/ack`, { method: "POST" });
}

export async function unackCommand(sessionId: string, threadId: string, commentId: string): Promise<void> {
  const url = await baseUrl(sessionId);
  await fetch(`${url}/api/threads/${threadId}/comments/${commentId}/ack`, { method: "DELETE" });
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
  // Repos are stored resolved-and-absolute (server.ts does this at session
  // creation); resolve the filter the same way so a relative path, a
  // trailing slash, or `.` doesn't fail to match a session that otherwise
  // covers this exact repo.
  const resolvedFilter = repoFilter ? path.resolve(repoFilter) : undefined;
  const sessionIds = entries.filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, ""));
  const results: Array<{ sessionId: string; repos: RepoConfig[] }> = [];
  for (const id of sessionIds) {
    try {
      const raw = await fs.readFile(path.join(getDataDir(), `${id}.json`), "utf-8");
      const data = JSON.parse(raw) as SessionData;
      if (data.status !== "active") continue;
      if (!resolvedFilter || data.repos.some(r => r.path === resolvedFilter)) {
        results.push({ sessionId: id, repos: data.repos });
      }
    } catch {
      continue;
    }
  }
  return results;
}

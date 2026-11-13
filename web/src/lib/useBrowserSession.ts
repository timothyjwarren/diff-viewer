import { useCallback, useEffect, useRef, useState } from "react";
import { fetchThreads, fetchRepoState } from "../api/client";
import type { CommentThread } from "../types";

export interface BrowserSession {
  threads: CommentThread[];
  headSha: string | null;
  dirtyFiles: string[];
  refresh: () => Promise<void>;
}

const POLL_MS = 3000;

/** Live threads and repo state for the file browser, polled like the main app. */
export function useBrowserSession(repoPath: string): BrowserSession {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [headSha, setHeadSha] = useState<string | null>(null);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      // Repo state first: reading it makes the server reposition threads against the current HEAD.
      const state = await fetchRepoState(repoPath);
      const fresh = await fetchThreads();
      if (!alive.current) return;
      setHeadSha(state.headSha);
      setDirtyFiles(state.dirtyFiles);
      setThreads(fresh);
    } catch {
      // Transient failure; the next poll retries.
    }
  }, [repoPath]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  return { threads, headSha, dirtyFiles, refresh };
}

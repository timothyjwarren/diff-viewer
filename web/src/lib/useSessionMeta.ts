import { useEffect, useRef, useState } from "react";
import { fetchSession, fetchSessionMeta } from "../api/client";
import type { CommentsReplaced } from "../types";

export const SESSION_META_POLL_MS = 3000;

/** Consecutive failed polls before the server counts as unreachable. */
export const UNREACHABLE_AFTER_FAILURES = 2;

/**
 * The session's id, title, and description, kept current by polling — the
 * agent can change the description (`diff-viewer describe`) or swap out every
 * comment (`diff-viewer reset` / `restore`) mid-session. `commentsReplacedBy`
 * says which of those last happened while this page was open, until dismissed.
 * `serverReachable` turns false after repeated poll failures (the server was
 * stopped or crashed) and true again as soon as a poll succeeds.
 * `agentListening` is whether an agent is waiting on the session.
 * `commentsReplacedAt` is when the comments were last replaced (null if never,
 * undefined until the session loads).
 */
export function useSessionMeta() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [commentsReplacedBy, setCommentsReplacedBy] = useState<CommentsReplaced["by"] | null>(null);
  const [serverReachable, setServerReachable] = useState(true);
  const [agentListening, setAgentListening] = useState(false);
  const failures = useRef(0);
  const [commentsReplacedAt, setCommentsReplacedAt] = useState<string | null | undefined>(undefined);
  // undefined until the session loads; null once loaded if its comments have never been replaced.
  const knownReplacedAt = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then(session => {
      if (cancelled) return;
      document.title = session.title;
      setSessionId(session.id);
      setTitle(session.title);
      setDescription(session.description ?? null);
      knownReplacedAt.current = session.commentsReplaced?.at ?? null;
      setCommentsReplacedAt(knownReplacedAt.current);
    }).catch(() => {});

    const interval = setInterval(() => {
      fetchSessionMeta()
        .then(meta => {
          if (cancelled) return;
          failures.current = 0;
          setServerReachable(true);
          setAgentListening(meta.agentListening);
          document.title = meta.title;
          setTitle(meta.title);
          setDescription(meta.description ?? null);
          if (knownReplacedAt.current === undefined) return;
          const replaced = meta.commentsReplaced;
          if (replaced && replaced.at !== knownReplacedAt.current) {
            knownReplacedAt.current = replaced.at;
            setCommentsReplacedAt(replaced.at);
            setCommentsReplacedBy(replaced.by);
          }
        })
        .catch(() => {
          if (cancelled) return;
          failures.current += 1;
          if (failures.current >= UNREACHABLE_AFTER_FAILURES) setServerReachable(false);
        });
    }, SESSION_META_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return {
    sessionId, title, description, commentsReplacedBy, commentsReplacedAt, serverReachable, agentListening,
    dismissCommentsReplaced: () => setCommentsReplacedBy(null),
  };
}

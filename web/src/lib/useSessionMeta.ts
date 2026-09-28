import { useEffect, useRef, useState } from "react";
import { fetchSession, fetchSessionMeta } from "../api/client";

export const SESSION_META_POLL_MS = 3000;

/**
 * The session's id, title, and description, kept current by polling — the
 * agent can change the description (`diff-viewer describe`) or clear every
 * comment (`diff-viewer reset`) mid-session. `wasReset` turns on when a
 * reset happens while this page is open.
 */
export function useSessionMeta() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [wasReset, setWasReset] = useState(false);
  // undefined until the session loads; null once loaded if it has never been reset.
  const knownResetAt = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then(session => {
      if (cancelled) return;
      document.title = session.title;
      setSessionId(session.id);
      setTitle(session.title);
      setDescription(session.description ?? null);
      knownResetAt.current = session.resetAt ?? null;
    }).catch(() => {});

    const interval = setInterval(() => {
      fetchSessionMeta()
        .then(meta => {
          if (cancelled) return;
          document.title = meta.title;
          setTitle(meta.title);
          setDescription(meta.description ?? null);
          const resetAt = meta.resetAt ?? null;
          if (knownResetAt.current !== undefined && resetAt !== knownResetAt.current) setWasReset(true);
          if (knownResetAt.current !== undefined) knownResetAt.current = resetAt;
        })
        .catch(() => {});
    }, SESSION_META_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { sessionId, title, description, wasReset, dismissReset: () => setWasReset(false) };
}

import { useEffect, useMemo, useReducer, useState } from "react";
import { codeToHtml } from "shiki";
import { detectLanguage } from "../lib/language";
import {
  fetchFileForView, createThread, addReply, editComment, deleteComment, resolveThread, flagThread, markCommentRead,
} from "../api/client";
import { SHIKI_THEMES } from "../lib/highlight";
import { selectionReducer } from "../lib/selection";
import { partitionThreads } from "../lib/browserThreads";
import { buildBrowseUrl, toBrowseRef } from "../lib/route";
import type { BrowserSession } from "../lib/useBrowserSession";
import type { CommentThread as CommentThreadData } from "../types";
import { CommentThread } from "./CommentThread";
import { Composer } from "./Composer";

const LINE_SPAN_RE = /<code[^>]*>([\s\S]*)<\/code>/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Loaded =
  | { status: "loading" }
  | { status: "ok"; html: string[] }
  | { status: "skipped"; reason: "binary" | "too-large" }
  | { status: "not-found" }
  | { status: "error" };

export function FilePane({ repoPath, gitRef, filePath, line, session }: {
  repoPath: string;
  gitRef: string;
  filePath: string;
  line?: number;
  session: BrowserSession;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [selection, dispatch] = useReducer(selectionReducer, null);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ status: "loading" });
    dispatch({ type: "clear" });
    (async () => {
      try {
        const res = await fetchFileForView(repoPath, filePath, gitRef);
        if (res.skipped) {
          if (!cancelled) setLoaded({ status: "skipped", reason: res.skipped });
          return;
        }
        const content = res.lines.join("\n");
        const html = await codeToHtml(content || " ", { lang: detectLanguage(filePath), ...SHIKI_THEMES });
        const match = LINE_SPAN_RE.exec(html);
        const inner = match ? match[1] : escapeHtml(content);
        if (!cancelled) setLoaded({ status: "ok", html: inner.split("\n") });
      } catch (err) {
        if (!cancelled) setLoaded({ status: /^404\b/.test((err as Error).message) ? "not-found" : "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [repoPath, filePath, gitRef]);

  const lineCount = loaded.status === "ok" ? loaded.html.length : 0;

  useEffect(() => {
    if (line === undefined || loaded.status !== "ok") return;
    document.getElementById(`L${line}`)?.scrollIntoView?.({ block: "center" });
  }, [line, loaded.status]);

  const { visible, hiddenCount } = useMemo(
    () => session.headSha === null
      ? { visible: [] as CommentThreadData[], hiddenCount: 0 }
      : partitionThreads(session.threads, {
        repoPath, file: filePath, ref: gitRef, headSha: session.headSha, dirtyFiles: session.dirtyFiles,
      }),
    [session.threads, session.headSha, session.dirtyFiles, repoPath, filePath, gitRef],
  );

  const threadsByLine = useMemo(() => {
    const map = new Map<number, CommentThreadData[]>();
    for (const t of visible) {
      const at = Math.min(Math.max(t.lineEnd, 1), Math.max(lineCount, 1));
      map.set(at, [...(map.get(at) ?? []), t]);
    }
    return map;
  }, [visible, lineCount]);

  if (loaded.status === "loading") return <div className="file-pane-state">Loading…</div>;
  if (loaded.status === "not-found") return <div className="file-pane-state">File not found at this ref</div>;
  if (loaded.status === "error") return <div className="file-pane-state">Could not load file</div>;
  if (loaded.status === "skipped") {
    return <div className="file-pane-state">{loaded.reason === "binary" ? "Binary file" : "File too large to display"}</div>;
  }

  const refresh = () => session.refresh();
  const after = (p: Promise<unknown>) => p.then(refresh);

  function clickLine(n: number, shift: boolean) {
    if (shift && selection) {
      const anchor = selection.start;
      dispatch({ type: "setRange", file: filePath, side: "new", start: Math.min(anchor, n), end: Math.max(anchor, n) });
    } else {
      dispatch({ type: "anchor", file: filePath, side: "new", line: n });
    }
  }

  async function submit(body: string, pending: boolean): Promise<boolean> {
    if (!selection) return false;
    try {
      await createThread(
        { repoPath, file: filePath, lineStart: selection.start, lineEnd: selection.end, side: "new", body, pending },
        gitRef,
      );
    } catch {
      return false;
    }
    dispatch({ type: "clear" });
    await refresh();
    return true;
  }

  return (
    <div className="file-pane">
      {hiddenCount > 0 && session.headSha !== null && (
        <div className="file-pane-banner">
          <span>
            {hiddenCount} {hiddenCount === 1 ? "thread" : "threads"} on this file {hiddenCount === 1 ? "is" : "are"} anchored to a newer version.
          </span>{" "}
          <a href={buildBrowseUrl({ repoPath, ref: toBrowseRef(session.headSha), path: filePath })}>Open at HEAD</a>
        </div>
      )}
      <div className="file-view-body">
        {loaded.html.map((html, i) => {
          const n = i + 1;
          const selected = selection !== null && n >= selection.start && n <= selection.end;
          const threads = threadsByLine.get(n);
          const composerHere = selection !== null && selection.end === n;
          return (
            <div key={n}>
              <div
                id={`L${n}`}
                className={`file-view-line${n === line ? " file-view-line-target" : ""}${selected ? " file-view-line-selected" : ""}`}
              >
                <span
                  className="file-view-line-number file-view-line-clickable"
                  onClick={e => clickLine(n, e.shiftKey)}
                >{n}</span>
                <span className="file-view-line-code" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
              {(threads || composerHere) && (
                <div className="file-view-annotations">
                  {threads?.map(thread => (
                    <CommentThread
                      key={thread.id} thread={thread}
                      onReply={(id, body, pending) => void after(addReply(id, body, pending))}
                      onEdit={(id, cid, body) => void after(editComment(id, cid, body))}
                      onDelete={(id, cid) => void after(deleteComment(id, cid))}
                      onResolve={(id, resolved) => void after(resolveThread(id, resolved))}
                      onFlag={(id, flagged) => void after(flagThread(id, flagged))}
                      onRead={(id, cid) => void markCommentRead(id, cid)}
                    />
                  ))}
                  {composerHere && (
                    <Composer
                      onSubmit={submit} onCancel={() => dispatch({ type: "clear" })} quotedText={null}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

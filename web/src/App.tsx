import { useEffect, useReducer, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DiffView, type CommentHandlers } from "./components/DiffView";
import { ReviewBar } from "./components/ReviewBar";
import {
  fetchDiffs, fetchSession, fetchThreads, createThread, addReply, editComment, deleteComment, submitVerdict,
  fetchCommits, fetchRepoDiff,
} from "./api/client";
import { selectionReducer } from "./lib/selection";
import { newAgentCommentIds } from "./lib/newComments";
import type { DiffFile, RepoDiff, CommentThread, VerdictType, CommitInfo, CommitRange } from "./types";

function fileAnchorId(file: DiffFile): string {
  const name = file.newPath || file.oldPath;
  return `file-${(file.repoPath + "-" + name).replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

function fileName(file: DiffFile): string {
  return file.newPath || file.oldPath;
}

interface DragState {
  file: string;
  side: "old" | "new";
  anchor: number;
}

export function App() {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
  const [commitsByRepo, setCommitsByRepo] = useState<Record<string, CommitInfo[]>>({});
  const [rangeByRepo, setRangeByRepo] = useState<Record<string, CommitRange | null>>({});
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [offscreenNewComments, setOffscreenNewComments] = useState<string[]>([]);
  const [lineSelection, dispatchLineSelection] = useReducer(selectionReducer, null);
  const [composerArmed, setComposerArmed] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const threadsRef = useRef<CommentThread[]>([]);
  const hasLoadedThreadsRef = useRef(false);

  function isCommentInViewport(commentId: string): boolean {
    const el = document.getElementById(`comment-${commentId}`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  async function refreshThreads(): Promise<CommentThread[]> {
    const fresh = await fetchThreads();
    if (hasLoadedThreadsRef.current) {
      const arrived = newAgentCommentIds(threadsRef.current, fresh);
      setOffscreenNewComments(prev => {
        // Drop any entry the user has since scrolled to themselves, then add
        // any newly-arrived agent replies that are currently off-screen.
        const stillOffscreen = prev.filter(id => !isCommentInViewport(id));
        const newlyOffscreen = arrived.filter(id => !isCommentInViewport(id));
        return [...new Set([...stillOffscreen, ...newlyOffscreen])];
      });
    }
    hasLoadedThreadsRef.current = true;
    threadsRef.current = fresh;
    setThreads(fresh);
    return fresh;
  }

  function jumpToNewComment(commentId: string) {
    document.getElementById(`comment-${commentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setOffscreenNewComments(prev => prev.filter(id => id !== commentId));
  }

  function directionToComment(commentId: string): "up" | "down" {
    const el = document.getElementById(`comment-${commentId}`);
    if (el && el.getBoundingClientRect().top < 0) return "up";
    return "down";
  }

  useEffect(() => {
    fetchDiffs().then(async loadedRepos => {
      setRepos(loadedRepos);
      const entries = await Promise.all(
        loadedRepos.map(r => fetchCommits(r.repoPath).then(commits => [r.repoPath, commits] as const)),
      );
      setCommitsByRepo(Object.fromEntries(entries));
    });
    fetchSession().then(session => { document.title = session.title; });
  }, []);

  async function handleOpenCommits(repoPath: string) {
    const commits = await fetchCommits(repoPath);
    setCommitsByRepo(prev => ({ ...prev, [repoPath]: commits }));
  }

  async function handleRangeChange(repoPath: string, range: CommitRange | null) {
    setRangeByRepo(prev => ({ ...prev, [repoPath]: range }));
    const files = await fetchRepoDiff(repoPath, range ?? undefined);
    setRepos(prev => prev.map(r => (r.repoPath === repoPath ? { ...r, files } : r)));
  }

  useEffect(() => {
    refreshThreads();
    const interval = setInterval(() => {
      refreshThreads();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // A gutter mousedown starts tracking a drag; releasing anywhere (not just
    // back over a gutter cell) must finalize it, so this listens globally
    // rather than relying on a mouseup handler on the line elements themselves.
    function onWindowMouseUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setComposerArmed(true);
    }
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  function scrollToFile(file: DiffFile) {
    document.getElementById(fileAnchorId(file))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function commentHandlersFor(file: DiffFile): CommentHandlers {
    const name = fileName(file);
    return {
      threads: threads.filter(t => t.repoPath === file.repoPath && t.file === name),
      selection: lineSelection && lineSelection.file === name ? lineSelection : null,
      composerArmed,
      onGutterMouseDown: (side, line) => {
        dragRef.current = { file: name, side, anchor: line };
        setComposerArmed(false);
        dispatchLineSelection({ type: "anchor", file: name, side, line });
      },
      onGutterMouseEnter: (side, line) => {
        const drag = dragRef.current;
        if (!drag || drag.file !== name || drag.side !== side) return;
        dispatchLineSelection({
          type: "setRange", file: name, side,
          start: Math.min(drag.anchor, line), end: Math.max(drag.anchor, line),
        });
      },
      onCancelSelection: () => {
        setComposerArmed(false);
        dispatchLineSelection({ type: "clear" });
      },
      onCreateThread: async (side, lineStart, lineEnd, body, pending) => {
        if (!body.trim()) return;
        await createThread({ repoPath: file.repoPath, file: name, lineStart, lineEnd, side, body, pending });
        setComposerArmed(false);
        dispatchLineSelection({ type: "clear" });
        await refreshThreads();
      },
      onReply: async (threadId, body, pending) => {
        if (!body.trim()) return;
        await addReply(threadId, body, pending);
        await refreshThreads();
      },
      onEdit: async (threadId, commentId, body) => {
        const next = window.prompt("Edit comment", body);
        if (next == null) return;
        await editComment(threadId, commentId, next);
        await refreshThreads();
      },
      onDelete: async (threadId, commentId) => {
        await deleteComment(threadId, commentId);
        await refreshThreads();
      },
    };
  }

  async function handleSubmitVerdict(type: VerdictType, summary?: string) {
    await submitVerdict(type, summary);
    await refreshThreads();
  }

  return (
    <div className="app">
      <Sidebar
        repos={repos} onSelectFile={scrollToFile}
        commitsByRepo={commitsByRepo} rangeByRepo={rangeByRepo} onRangeChange={handleRangeChange}
        onOpenCommits={handleOpenCommits}
      />
      <main>
        {repos.length === 0 && <p className="empty-state">No changes to review.</p>}
        {repos.map(repo => repo.files.map(file => (
          <div key={fileAnchorId(file)} id={fileAnchorId(file)} className="file-anchor">
            <DiffView
              file={file}
              repoPath={repo.repoPath}
              repoName={`${repo.repo}:${repo.branch}`}
              baseRef=""
              comments={commentHandlersFor(file)}
            />
          </div>
        )))}
      </main>
      <ReviewBar onSubmit={handleSubmitVerdict} />
      {offscreenNewComments.length > 0 && (
        <button
          type="button"
          className="new-comment-banner"
          onClick={() => jumpToNewComment(offscreenNewComments[0])}
        >
          <span className={`new-comment-banner-arrow new-comment-banner-arrow-${directionToComment(offscreenNewComments[0])}`} />
          {offscreenNewComments.length === 1 ? "New comment" : `${offscreenNewComments.length} new comments`}
        </button>
      )}
    </div>
  );
}

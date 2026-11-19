import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DiffView, type CommentHandlers } from "./components/DiffView";
import { ReviewBar } from "./components/ReviewBar";
import {
  fetchDiffs, fetchThreads, createThread, addReply, editComment, deleteComment, resolveThread,
  submitVerdict, fetchCommits, fetchRepoDiff, fetchRepoState, flagThread, markCommentRead,
} from "./api/client";
import { selectionReducer, type SelectionRange } from "./lib/selection";
import { newAgentCommentIds } from "./lib/newComments";
import { fileAnchorId } from "./lib/fileAnchor";
import { computeViewportSpan, type ViewportSpan } from "./lib/viewportSpan";
import { useSessionMeta } from "./lib/useSessionMeta";
import { useReviewedFiles } from "./lib/useReviewedFiles";
import { ScrollbarMarkers } from "./components/ScrollbarMarkers";
import { compareScopeState } from "./lib/scopeStaleness";
import { rangeAfterReload, onScopeChange } from "./lib/scopeChange";
import {
  findAdjacentComment, findCommentBeside, isEditableTarget, threadNavAvailability,
  type CommentPosition, type NavAvailability,
} from "./lib/commentNav";
import type { DiffFile, RepoDiff, CommentThread, VerdictType, CommitInfo, CommitRange, ScopeState } from "./types";

/** A scoped repo opens on "all commits + uncommitted changes", so committing a scoped file changes nothing on screen. */
const SCOPED_DEFAULT_RANGE: CommitRange = { from: "", to: "uncommitted" };

function fileName(file: DiffFile): string {
  return file.newPath || file.oldPath;
}

interface DragState {
  file: string;
  side: "old" | "new";
  anchor: number;
}

// Resolves a browser Selection endpoint (anchorNode/focusNode) to the diff
// line it falls within, by walking up to the nearest .diff-pane/.diff-line
// ancestors — unrelated to the custom gutter-drag SelectionState below.
function resolveLineInfo(node: Node | null): { file: string; side: "old" | "new"; line: number } | null {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  const lineEl = el?.closest("[data-line-number]");
  const paneEl = el?.closest(".diff-pane");
  if (!lineEl || !paneEl) return null;
  const line = Number(lineEl.getAttribute("data-line-number"));
  const side = paneEl.getAttribute("data-side");
  const file = paneEl.getAttribute("data-file");
  if (!Number.isFinite(line) || (side !== "old" && side !== "new") || file == null) return null;
  return { file, side, line };
}

// Captures the active browser text selection as a quote, but only if it
// falls entirely within the line range the user just finished dragging over
// in the gutter — otherwise there's nothing to quote.
function captureSelectionQuote(sel: SelectionRange): string | null {
  const domSel = window.getSelection();
  if (!domSel || domSel.isCollapsed) return null;
  const text = domSel.toString();
  if (!text.trim()) return null;
  const anchor = resolveLineInfo(domSel.anchorNode);
  const focus = resolveLineInfo(domSel.focusNode);
  if (!anchor || !focus) return null;
  if (anchor.file !== sel.file || focus.file !== sel.file) return null;
  if (anchor.side !== sel.side || focus.side !== sel.side) return null;
  const lo = Math.min(anchor.line, focus.line);
  const hi = Math.max(anchor.line, focus.line);
  if (lo < sel.start || hi > sel.end) return null;
  return text;
}

export function App() {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [commitsByRepo, setCommitsByRepo] = useState<Record<string, CommitInfo[]>>({});
  const [rangeByRepo, setRangeByRepo] = useState<Record<string, CommitRange | null>>({});
  const [dirtyFilesByRepo, setDirtyFilesByRepo] = useState<Record<string, string[]>>({});
  const [headShaByRepo, setHeadShaByRepo] = useState<Record<string, string>>({});
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [offscreenNewComments, setOffscreenNewComments] = useState<string[]>([]);
  const [lineSelection, dispatchLineSelection] = useReducer(selectionReducer, null);
  const [composerArmed, setComposerArmed] = useState(false);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [viewportSpan, setViewportSpan] = useState<ViewportSpan | null>(null);
  const { sessionId, title, description, commentsReplacedBy, commentsReplacedAt, dismissCommentsReplaced, serverReachable, agentListening, scope } = useSessionMeta();
  // Per tab and never saved: a reload starts with the scope applied.
  const [showAll, setShowAll] = useState(false);
  const showAllRef = useRef(false);
  const rangeByRepoRef = useRef<Record<string, CommitRange | null>>({});
  useEffect(() => { rangeByRepoRef.current = rangeByRepo; }, [rangeByRepo]);
  // The scope fingerprints each scoped repo's shown files were loaded with.
  const loadedScopeRef = useRef<Record<string, ScopeState>>({});
  const [staleFilesByRepo, setStaleFilesByRepo] = useState<Record<string, Set<string>>>({});
  const [staleRepos, setStaleRepos] = useState<Set<string>>(new Set());
  const reviewed = useReviewedFiles(sessionId, commentsReplacedAt, repos.flatMap(r => r.files));
  const mainRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const threadsRef = useRef<CommentThread[]>([]);
  const hasLoadedThreadsRef = useRef(false);
  const readRequestedRef = useRef<Set<string>>(new Set());
  const lineSelectionRef = useRef(lineSelection);
  useEffect(() => { lineSelectionRef.current = lineSelection; }, [lineSelection]);

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

  function clearStale(repoPath: string) {
    setStaleFilesByRepo(prev => {
      if (!prev[repoPath]) return prev;
      const next = { ...prev };
      delete next[repoPath];
      return next;
    });
    setStaleRepos(prev => {
      if (!prev.has(repoPath)) return prev;
      const next = new Set(prev);
      next.delete(repoPath);
      return next;
    });
  }

  /**
   * Fetches a scoped repo's fingerprints for `range`, to compare later polls
   * against. Called before the files are fetched, so a change landing between
   * the two shows up as stale rather than going unnoticed.
   */
  async function fingerprintsFor(repoPath: string, range: CommitRange | null): Promise<ScopeState | undefined> {
    try {
      return (await fetchRepoState(repoPath, range?.to ?? "HEAD")).scope;
    } catch {
      return undefined;
    }
  }

  function recordFingerprints(repoPath: string, state: ScopeState | undefined) {
    if (state) loadedScopeRef.current[repoPath] = state;
    else delete loadedScopeRef.current[repoPath];
  }

  /**
   * Loads every repo's files and commits, ignoring the scope when `all` is
   * set. `rangeFor` picks each repo's range; by default a scoped repo gets the
   * scoped default and an unscoped one the committed-only view.
   */
  async function loadAll(
    all: boolean,
    rangeFor: (repo: RepoDiff, commits: CommitInfo[]) => CommitRange | null = repo => (repo.scoped ? SCOPED_DEFAULT_RANGE : null),
  ) {
    const fresh = await fetchDiffs(all);
    const commitEntries = await Promise.all(
      fresh.map(r => fetchCommits(r.repoPath, all).then(commits => [r.repoPath, commits] as const)),
    );
    const commits = Object.fromEntries(commitEntries);
    const ranges = Object.fromEntries(fresh.map(r => [r.repoPath, rangeFor(r, commits[r.repoPath] ?? [])]));
    // An unscoped repo on its default view keeps /api/diffs' files. A scoped
    // repo is refetched after its fingerprints, so no change slips in unseen.
    const withFiles = await Promise.all(fresh.map(async r => {
      const range = ranges[r.repoPath];
      const state = r.scoped ? await fingerprintsFor(r.repoPath, range) : undefined;
      const files = !r.scoped && range === null ? r.files : await fetchRepoDiff(r.repoPath, range ?? undefined, all);
      recordFingerprints(r.repoPath, state);
      return { ...r, files };
    }));
    setRangeByRepo(ranges);
    setCommitsByRepo(commits);
    setRepos(withFiles);
    setStaleFilesByRepo({});
    setStaleRepos(new Set());
    setLoaded(true);
  }

  useEffect(() => {
    // Mount-only: later loads come from the toggle and scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void loadAll(false);
  }, []);

  async function handleOpenCommits(repoPath: string) {
    const commits = await fetchCommits(repoPath, showAllRef.current);
    setCommitsByRepo(prev => ({ ...prev, [repoPath]: commits }));
  }

  async function handleRangeChange(repoPath: string, range: CommitRange | null) {
    setRangeByRepo(prev => ({ ...prev, [repoPath]: range }));
    const scoped = repos.find(r => r.repoPath === repoPath)?.scoped;
    const state = scoped ? await fingerprintsFor(repoPath, range) : undefined;
    const files = await fetchRepoDiff(repoPath, range ?? undefined, showAllRef.current);
    recordFingerprints(repoPath, state);
    clearStale(repoPath);
    setRepos(prev => prev.map(r => (r.repoPath === repoPath ? { ...r, files } : r)));
  }

  /** Each repo's current range when its commits are still listed, else the default for its scoping. */
  const keepRange = (repo: RepoDiff, commits: CommitInfo[]) =>
    rangeAfterReload(rangeByRepoRef.current[repo.repoPath] ?? null, commits, Boolean(repo.scoped));

  /** Reloads every repo after a scope change. */
  function reloadForScope() {
    pendingScopeReloadRef.current = false;
    return loadAll(showAllRef.current, keepRange);
  }

  /** Refetches one repo's files and commits for its current range, clearing its stale notices. */
  async function reloadRepo(repoPath: string) {
    // A scope change deferred while a comment was being written reloads everything.
    if (pendingScopeReloadRef.current) return reloadForScope();
    await handleRangeChange(repoPath, rangeByRepoRef.current[repoPath] ?? null);
    await handleOpenCommits(repoPath);
  }

  // The agent can change the scope mid-session (`diff-viewer scope`).
  const knownScopeRef = useRef<string | undefined>(undefined);
  const pendingScopeReloadRef = useRef(false);
  const composerArmedRef = useRef(composerArmed);
  useEffect(() => { composerArmedRef.current = composerArmed; }, [composerArmed]);
  useEffect(() => {
    if (scope === undefined) return;
    const key = JSON.stringify(scope);
    const known = knownScopeRef.current;
    knownScopeRef.current = key;
    // The first value is what the page loaded with.
    if (known === undefined || known === key) return;
    if (onScopeChange(composerArmedRef.current) === "defer") {
      pendingScopeReloadRef.current = true;
      setStaleRepos(new Set(repos.map(r => r.repoPath)));
      return;
    }
    void reloadForScope();
    // Runs only when the scope changes; the rest is read through refs or is current enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  function toggleShowAll() {
    const next = !showAll;
    showAllRef.current = next;
    setShowAll(next);
    // The toggle only lifts the filter: the range the user is looking at stays.
    void loadAll(next, keepRange);
  }

  useEffect(() => {
    function pollRepoStates() {
      repos.forEach(r => {
        const loadedState = r.scoped ? loadedScopeRef.current[r.repoPath] : undefined;
        const to = loadedState ? rangeByRepoRef.current[r.repoPath]?.to ?? "HEAD" : undefined;
        fetchRepoState(r.repoPath, to)
        .then(state => {
          setDirtyFilesByRepo(prev => ({ ...prev, [r.repoPath]: state.dirtyFiles }));
          setHeadShaByRepo(prev => (prev[r.repoPath] === state.headSha ? prev : { ...prev, [r.repoPath]: state.headSha }));
          // Compare only against the state this view was loaded with; a reload in flight replaces it.
          if (!state.scope || loadedScopeRef.current[r.repoPath] !== loadedState || !loadedState) return;
          const { staleFiles, repoStale } = compareScopeState(loadedState, state.scope);
          if (staleFiles.size > 0) {
            setStaleFilesByRepo(prev => {
              const known = prev[r.repoPath] ?? new Set<string>();
              if ([...staleFiles].every(f => known.has(f))) return prev;
              return { ...prev, [r.repoPath]: new Set([...known, ...staleFiles]) };
            });
          }
          if (repoStale) setStaleRepos(prev => (prev.has(r.repoPath) ? prev : new Set([...prev, r.repoPath])));
        })
        .catch(() => {});
      });
    }
    refreshThreads();
    pollRepoStates();
    const interval = setInterval(() => {
      refreshThreads();
      pollRepoStates();
    }, 3000);
    return () => clearInterval(interval);
  }, [repos]);

  useEffect(() => {
    // A gutter mousedown starts tracking a drag; releasing anywhere (not just
    // back over a gutter cell) must finalize it, so this listens globally
    // rather than relying on a mouseup handler on the line elements themselves.
    function onWindowMouseUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      const sel = lineSelectionRef.current;
      setQuotedText(sel ? captureSelectionQuote(sel) : null);
      setComposerArmed(true);
    }
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const mainTop = main.getBoundingClientRect().top;
      const rects = Array.from(main.querySelectorAll<HTMLElement>(".file-anchor")).map(el => {
        const rect = el.getBoundingClientRect();
        return { id: el.id, top: rect.top - mainTop, bottom: rect.bottom - mainTop };
      });
      const next = computeViewportSpan(rects, main.clientHeight);
      setViewportSpan(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

    schedule();
    main.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    main.querySelectorAll(".file-anchor").forEach(el => resizeObserver?.observe(el));
    return () => {
      cancelAnimationFrame(frame);
      main.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
    };
  }, [repos]);

  const currentCommentIdRef = useRef<string | null>(null);

  // Every comment -- root and replies alike -- gets tagged with its thread's
  // root id, so the navigation helpers can tell replies apart from roots
  // (only roots are valid navigation targets) while still using reply
  // positions to detect which chain the viewport is inside.
  const commentPositions = useCallback((): CommentPosition[] => {
    const rootIdByCommentId = new Map<string, string>();
    for (const thread of threadsRef.current) {
      const rootId = thread.comments[0]?.id;
      if (!rootId) continue;
      for (const comment of thread.comments) rootIdByCommentId.set(comment.id, rootId);
    }
    return Array.from(document.querySelectorAll<HTMLElement>("[id^='comment-']"))
      .map(el => {
        const commentId = el.id.slice("comment-".length);
        return { id: commentId, rootId: rootIdByCommentId.get(commentId) ?? commentId, top: el.getBoundingClientRect().top };
      });
  }, []);

  const goToComment = useCallback((commentId: string) => {
    currentCommentIdRef.current = commentId;
    document.getElementById(`comment-${commentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey || !e.shiftKey) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (isEditableTarget(e.target as Element | null)) return;
      const direction = e.key === "ArrowDown" ? "next" : "previous";
      const target = findAdjacentComment(commentPositions(), direction, currentCommentIdRef.current);
      if (!target) return;
      e.preventDefault();
      goToComment(target);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commentPositions, goToComment]);

  const [navAvailability, setNavAvailability] = useState<NavAvailability>({});

  // Relative thread positions only change when the DOM does (diffs load,
  // threads expand or collapse), not on scroll, so a mutation observer is
  // enough to keep the previous/next buttons' disabled states current.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const threadPositions = threadsRef.current.flatMap(t => {
        const el = document.getElementById(`thread-${t.id}`);
        const rootId = t.comments[0]?.id;
        return el && rootId ? [{ threadId: t.id, rootId, top: el.getBoundingClientRect().top }] : [];
      });
      const next = threadNavAvailability(threadPositions, commentPositions());
      setNavAvailability(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [threads, commentPositions]);

  function navigateFromThread(threadId: string, direction: "next" | "previous") {
    const threadEl = document.getElementById(`thread-${threadId}`);
    const thread = threadsRef.current.find(t => t.id === threadId);
    if (!threadEl || !thread) return;
    const target = findCommentBeside(
      commentPositions(), direction, threadEl.getBoundingClientRect().top, thread.comments[0]?.id ?? "",
    );
    if (target) goToComment(target);
  }

  function scrollToFile(file: DiffFile) {
    document.getElementById(fileAnchorId(file))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Runs a comment action, reporting a failure in the error notice instead of letting it reject silently. */
  async function attempt(action: string, run: () => Promise<void>): Promise<boolean> {
    try {
      await run();
      setFailure(null);
      return true;
    } catch (err) {
      setFailure(`Couldn't ${action}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  function commentHandlersFor(file: DiffFile): CommentHandlers {
    const name = fileName(file);
    return {
      threads: threads.filter(t => t.repoPath === file.repoPath && t.file === name),
      selection: lineSelection && lineSelection.file === name ? lineSelection : null,
      composerArmed,
      quotedText,
      onGutterMouseDown: (side, line) => {
        dragRef.current = { file: name, side, anchor: line };
        setComposerArmed(false);
        setQuotedText(null);
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
        setQuotedText(null);
        dispatchLineSelection({ type: "clear" });
      },
      onCreateThread: (side, lineStart, lineEnd, body, pending) => attempt("save the comment", async () => {
        if (!body.trim()) return;
        const toRef = rangeByRepo[file.repoPath]?.to ?? "HEAD";
        await createThread({ repoPath: file.repoPath, file: name, lineStart, lineEnd, side, body, pending }, toRef);
        setComposerArmed(false);
        setQuotedText(null);
        dispatchLineSelection({ type: "clear" });
        await refreshThreads();
      }),
      onReply: (threadId, body, pending) => attempt("save the reply", async () => {
        if (!body.trim()) return;
        await addReply(threadId, body, pending);
        await refreshThreads();
      }),
      onEdit: (threadId, commentId, body) => attempt("save the edit", async () => {
        await editComment(threadId, commentId, body);
        await refreshThreads();
      }),
      onDelete: (threadId, commentId) => attempt("delete the comment", async () => {
        await deleteComment(threadId, commentId);
        await refreshThreads();
      }),
      onResolve: (threadId, resolved) => attempt("update the thread", async () => {
        await resolveThread(threadId, resolved);
        await refreshThreads();
      }),
      onFlag: (threadId, flagged) => attempt("update the thread", async () => {
        await flagThread(threadId, flagged);
        await refreshThreads();
      }),
      navAvailability,
      onNavigate: navigateFromThread,
      onRead: async (threadId, commentId) => {
        // A comment can report itself visible again before the refreshed
        // threads arrive, so each one is only ever sent once.
        if (readRequestedRef.current.has(commentId)) return;
        readRequestedRef.current.add(commentId);
        await markCommentRead(threadId, commentId);
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
      <div className="sidebar-column">
        <Sidebar
          repos={repos} onSelectFile={scrollToFile}
          commitsByRepo={commitsByRepo} rangeByRepo={rangeByRepo} onRangeChange={handleRangeChange}
          onOpenCommits={handleOpenCommits} title={title} description={description} sessionId={sessionId} viewportSpan={viewportSpan} threads={threads}
          isReviewed={reviewed.isReviewed}
          reviewedCount={reviewed.reviewedCount} anyReviewedCollapsed={reviewed.anyReviewedCollapsed}
          onToggleAllReviewed={reviewed.toggleAllReviewed}
          agentListening={serverReachable ? agentListening : null}
          headShaByRepo={headShaByRepo}
          scope={scope ?? null} showAll={showAll} onToggleShowAll={toggleShowAll}
          staleRepos={staleRepos} onReloadRepo={repoPath => void reloadRepo(repoPath)}
        />
        <ReviewBar
          onSubmit={handleSubmitVerdict}
          pendingCount={threads.reduce((n, t) => n + t.comments.filter(c => c.pending).length, 0)}
        />
      </div>
      <div className="main-pane">
      {!serverReachable && (
        <div className="connection-lost" role="alert">
          Lost connection to the diff viewer server. It may have been stopped. Comments can't be saved until it's back.
        </div>
      )}
      <main ref={mainRef}>
        {repos.length === 0 && (
          <p className="empty-state">{loaded ? "No changes to review." : "Loading changes…"}</p>
        )}
        {repos.map(repo => repo.files.map(file => (
          <div key={fileAnchorId(file)} id={fileAnchorId(file)} className="file-anchor">
            <DiffView
              file={file}
              repoPath={repo.repoPath}
              repoName={`${repo.repo}:${repo.branch}`}
              gitRef={rangeByRepo[repo.repoPath]?.to ?? "working"}
              rangeFrom={rangeByRepo[repo.repoPath]?.from}
              showUncommittedBanner={
                rangeByRepo[repo.repoPath]?.to === "uncommitted"
                && Boolean(dirtyFilesByRepo[repo.repoPath]?.includes(fileName(file)))
              }
              comments={commentHandlersFor(file)}
              collapsed={reviewed.isCollapsed(file)}
              reviewed={reviewed.isReviewed(file)}
              onToggleCollapsed={() => reviewed.toggleCollapsed(file)}
              onToggleReviewed={() => reviewed.toggleReviewed(file)}
              stale={staleFilesByRepo[repo.repoPath]?.has(fileName(file)) ? { onReload: () => void reloadRepo(repo.repoPath) } : undefined}
            />
          </div>
        )))}
      </main>
      <ScrollbarMarkers
        threads={threads} scrollRef={mainRef}
        onExpandFile={(repoPath, name) => {
          const file = repos.find(r => r.repoPath === repoPath)?.files.find(f => fileName(f) === name);
          if (file && reviewed.isCollapsed(file)) reviewed.toggleCollapsed(file);
        }}
      />
      </div>
      {failure && (
        <div className="comments-notice comments-notice-error" role="alert">
          {failure}
          <button type="button" className="comments-notice-dismiss" aria-label="Dismiss" onClick={() => setFailure(null)}>×</button>
        </div>
      )}
      {commentsReplacedBy && (
        <div className="comments-notice" role="status">
          {commentsReplacedBy === "reset" ? "The agent cleared all comments." : "The agent restored archived comments."}
          <button type="button" className="comments-notice-dismiss" aria-label="Dismiss" onClick={dismissCommentsReplaced}>×</button>
        </div>
      )}
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

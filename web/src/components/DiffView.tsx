import { useEffect, useMemo, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import type { CommentThread as CommentThreadData, DiffFile, DiffHunk, DiffLine } from "../types";
import { detectLanguage } from "../lib/language";
import { expandHunkContext, hiddenLinesBefore, hiddenLinesAfter, findGapExpansionForLine } from "../lib/expandContext";
import { pairHunkLines, type PairedRow } from "../lib/pairLines";
import { inlineChanges, type Range } from "../lib/inlineDiff";
import type { SelectionState } from "../lib/selection";
import { fetchFile } from "../api/client";
import { CommentThread } from "./CommentThread";
import { ExpandStrip } from "./ExpandStrip";
import { shiftForUncommitted } from "../lib/uncommittedShift";

const LINE_SPAN_RE = /<code[^>]*>([\s\S]*)<\/code>/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function highlightLineInner(content: string, lang: string, changes: Range[]): Promise<string> {
  // shiki's codeToHtml always wraps a single line in its own <pre><code>...</code></pre>.
  // Keeping that wrapper makes every diff line render as its own boxed/margined block
  // (browser default `pre { margin }` plus shiki's own per-<pre> background-color), so
  // we discard the <pre>/<code> shell and keep only the highlighted <span> content.
  const html = await codeToHtml(content || " ", {
    lang, theme: "github-dark",
    decorations: changes.map(([start, end]) => ({ start, end, properties: { class: "diff-inline-change" } })),
  });
  const match = LINE_SPAN_RE.exec(html);
  return match ? match[1] : escapeHtml(content);
}

const MARKERS: Record<DiffLine["type"], string> = { add: "+", del: "-", context: "" };

const NO_CHANGES: Range[] = [];

function Line({ line, counterpart, lang, repoName, side, selected, onGutterMouseDown, onGutterMouseEnter }: {
  line: DiffLine;
  /** The other side's line in a changed pair, whose differences get highlighted. */
  counterpart: DiffLine | null;
  lang: string; repoName: string; side: "old" | "new";
  selected: boolean;
  onGutterMouseDown: (line: number) => void;
  onGutterMouseEnter: (line: number) => void;
}) {
  const [html, setHtml] = useState<string>(() => escapeHtml(line.content));
  const changes = useMemo(() => {
    if (!counterpart) return NO_CHANGES;
    const pair = side === "old"
      ? inlineChanges(line.content, counterpart.content)
      : inlineChanges(counterpart.content, line.content);
    return pair?.[side] ?? NO_CHANGES;
  }, [line.content, counterpart, side]);
  useEffect(() => {
    let cancelled = false;
    highlightLineInner(line.content, lang, changes).then(result => {
      if (!cancelled) setHtml(result);
    }).catch(() => setHtml(escapeHtml(line.content)));
    return () => { cancelled = true; };
  }, [line.content, lang, changes]);

  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;

  return (
    <div
      className={`diff-line diff-line-${line.type}${selected ? " diff-line-selected" : ""}${line.uncommitted ? " diff-line-uncommitted" : ""}`}
      data-line-number={lineNumber}
    >
      {/*
       * Selecting/commenting is driven entirely from the gutter, never the code
       * text itself — that keeps .diff-pane's user-select:text (copy/paste)
       * completely unaffected by our click handling. A plain gutter
       * mousedown+mouseup (no drag) opens a single-line comment; mousedown then
       * dragging into other lines' gutters before releasing extends the range,
       * opening a multi-line comment on release.
       */}
      <span
        className="diff-line-gutter"
        onMouseDown={() => { if (lineNumber != null) onGutterMouseDown(lineNumber); }}
        onMouseEnter={() => { if (lineNumber != null) onGutterMouseEnter(lineNumber); }}
      >
        <span className="diff-line-number">{lineNumber ?? ""}</span>
        <span className="diff-line-add-icon">+</span>
      </span>
      <span className="diff-line-marker">{MARKERS[line.type]}</span>
      <span className="diff-line-code" dangerouslySetInnerHTML={{ __html: html }} data-repo={repoName} />
    </div>
  );
}

function EmptyLine() {
  return <div className="diff-line diff-line-empty" />;
}

export interface CommentHandlers {
  threads: CommentThreadData[];
  selection: SelectionState;
  composerArmed: boolean;
  quotedText: string | null;
  onGutterMouseDown: (side: "old" | "new", line: number) => void;
  onGutterMouseEnter: (side: "old" | "new", line: number) => void;
  onCreateThread: (side: "old" | "new", lineStart: number, lineEnd: number, body: string, pending: boolean) => void;
  onCancelSelection: () => void;
  onReply: (threadId: string, body: string, pending: boolean) => void;
  onEdit: (threadId: string, commentId: string, body: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
  onResolve: (threadId: string, resolved: boolean) => void;
}

function formatQuote(text: string): string {
  return text.split("\n").map(line => `> ${line}`).join("\n") + "\n\n";
}

function Composer({ onSubmit, onCancel, quotedText }: {
  onSubmit: (body: string, pending: boolean) => void;
  onCancel: () => void;
  quotedText: string | null;
}) {
  const [draft, setDraft] = useState(() => (quotedText ? formatQuote(quotedText) : ""));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit(pending: boolean) {
    onSubmit(draft, pending);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "";
  }

  return (
    <div className="comment-composer">
      <textarea
        ref={textareaRef}
        placeholder="Leave a comment..." value={draft} autoFocus
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape" && draft.trim() === "") onCancel();
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(false); }
        }}
      />
      <div className="comment-reply-actions">
        <button onClick={() => submit(false)}>Add single comment</button>
        <button onClick={() => submit(true)}>Add to review</button>
        <button className="comment-cancel-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Pane({ hunks, side, lang, repoName, fileId, comments, onExpand, fileLineCount }: {
  hunks: DiffHunk[]; side: "old" | "new"; lang: string; repoName: string; fileId: string; comments: CommentHandlers;
  onExpand: (hunkIndex: number, direction: "up" | "down", amount?: number) => void;
  fileLineCount: number | null;
}) {
  return (
    <div className="diff-pane" data-side={side} data-file={fileId}>
      <div className="diff-pane-content">
        {hunks.map((hunk, hi) => {
          const rows: PairedRow[] = pairHunkLines(hunk.lines);
          const gapBefore = hiddenLinesBefore(hunks, hi);
          return (
            <div key={hi} className="diff-hunk">
              {gapBefore > 0 && (
                <ExpandStrip
                  showUp showDown={hi > 0}
                  hiddenCount={gapBefore}
                  onExpandUp={() => onExpand(hi, "up")}
                  onExpandDown={hi > 0 ? () => onExpand(hi - 1, "down") : undefined}
                  onExpandAll={() => onExpand(hi, "up", gapBefore)}
                />
              )}
              {rows.map((row, ri) => {
                const l = row[side];
                if (!l) return <EmptyLine key={ri} />;

                const lineNumber = side === "old" ? l.oldLineNumber : l.newLineNumber;
                const selected = Boolean(
                  comments.selection && comments.selection.side === side && lineNumber != null &&
                  lineNumber >= comments.selection.start && lineNumber <= comments.selection.end,
                );
                const threadsHere = comments.threads.filter(t => {
                  if (t.side !== side || lineNumber == null) return false;
                  // Uncommitted edits only shift "new"-side numbering; a
                  // thread's stored lineEnd is canonical (HEAD-relative), so
                  // project it into this view's displayed numbering before
                  // matching it to the line actually being rendered.
                  const displayLine = side === "new" ? shiftForUncommitted(hunks, t.lineEnd) : t.lineEnd;
                  return displayLine === lineNumber;
                });
                const showComposer = Boolean(
                  comments.composerArmed && comments.selection && comments.selection.side === side &&
                  lineNumber === comments.selection.end && threadsHere.length === 0,
                );
                return (
                  <div key={ri}>
                    <Line
                      line={l} counterpart={l.type === "context" ? null : row[side === "old" ? "new" : "old"]} lang={lang} repoName={repoName} side={side} selected={selected}
                      onGutterMouseDown={(line) => comments.onGutterMouseDown(side, line)}
                      onGutterMouseEnter={(line) => comments.onGutterMouseEnter(side, line)}
                    />
                    {threadsHere.map(thread => (
                      <CommentThread
                        key={thread.id} thread={thread}
                        onReply={comments.onReply} onEdit={comments.onEdit} onDelete={comments.onDelete}
                        onResolve={comments.onResolve}
                      />
                    ))}
                    {showComposer && comments.selection && (
                      <Composer
                        onSubmit={(body, pending) => comments.onCreateThread(
                          side, comments.selection!.start, comments.selection!.end, body, pending,
                        )}
                        onCancel={comments.onCancelSelection}
                        quotedText={comments.quotedText}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {hunks.length > 0 && (() => {
          const lastIndex = hunks.length - 1;
          const gapAfter = hiddenLinesAfter(hunks, lastIndex, fileLineCount);
          if (gapAfter === 0) return null;
          return (
            <ExpandStrip
              showUp={false} showDown
              hiddenCount={gapAfter}
              onExpandDown={() => onExpand(lastIndex, "down")}
              onExpandAll={() => onExpand(lastIndex, "down", gapAfter ?? undefined)}
            />
          );
        })()}
      </div>
    </div>
  );
}

export function DiffView({ file, repoPath, repoName, gitRef, showUncommittedBanner, comments }: {
  file: DiffFile; repoPath: string; repoName: string; gitRef: string;
  /** Only when the active range targets uncommitted AND this specific file actually has an uncommitted edit. */
  showUncommittedBanner?: boolean;
  comments: CommentHandlers;
}) {
  const [hunks, setHunks] = useState<DiffHunk[]>(file.hunks);
  const [fullFileLines, setFullFileLines] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [paneSplit, setPaneSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; split: number } | null>(null);
  const justCollapsedRef = useRef(false);
  const beforeCollapseTopRef = useRef<number | null>(null);
  const autoExpandedThreadIdsRef = useRef<Set<string>>(new Set());
  const lang = detectLanguage(file.newPath || file.oldPath);
  const fileId = file.newPath || file.oldPath;
  const isNewFile = file.status === "added";

  function toggleCollapsed() {
    if (!collapsed) {
      beforeCollapseTopRef.current = headerRef.current?.getBoundingClientRect().top ?? null;
      justCollapsedRef.current = true;
    }
    setCollapsed(c => !c);
  }

  // Collapsing removes the file's body, which can un-stick this file's
  // sticky header (e.g. when you were scrolled deep into it) and leave the
  // viewport showing whatever now lands at the old scroll position instead.
  // Rather than forcing the header to the top (which jumps files that
  // weren't scrolled that far), this measures how far the header actually
  // moved on screen and scrolls by exactly that much to cancel it out —
  // a no-op when the header didn't move. Runs in an effect (after the
  // collapse commits, not as a side effect inside the setCollapsed updater,
  // which StrictMode invokes twice) guarded by a ref so it still fires only
  // once per real toggle.
  useEffect(() => {
    if (!collapsed || !justCollapsedRef.current) return;
    justCollapsedRef.current = false;
    const before = beforeCollapseTopRef.current;
    const headerEl = headerRef.current;
    if (before == null || !headerEl) return;
    const after = headerEl.getBoundingClientRect().top;
    const delta = after - before;
    if (delta !== 0) headerEl.closest("main")?.scrollBy(0, delta);
  }, [collapsed]);

  // A thread pinned to a line inside a currently-hidden context gap would
  // otherwise never render anywhere — there's no visible line for it to
  // attach to. Auto-expand just enough of the surrounding gap to bring it
  // into view. Guarded per-thread-id so this only ever fires once per
  // thread, even though `comments.threads` gets a new array identity on
  // every parent render.
  useEffect(() => {
    for (const t of comments.threads) {
      if (autoExpandedThreadIdsRef.current.has(t.id)) continue;
      const lineNumber = t.side === "new" ? shiftForUncommitted(hunks, t.lineEnd) : t.lineEnd;
      const gap = findGapExpansionForLine(hunks, lineNumber);
      if (!gap) continue;
      autoExpandedThreadIdsRef.current.add(t.id);
      expand(gap.hunkIndex, gap.direction, gap.amount);
    }
  }, [hunks, comments.threads]);

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, split: paneSplit };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      const start = dragStartRef.current;
      const width = bodyRef.current?.getBoundingClientRect().width;
      if (!start || !width) return;
      const deltaPct = ((e.clientX - start.x) / width) * 100;
      setPaneSplit(Math.min(80, Math.max(20, start.split + deltaPct)));
    }
    function onMouseUp() {
      dragStartRef.current = null;
      setDragging(false);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging]);

  useEffect(() => setHunks(file.hunks), [file]);

  async function loadFullFile() {
    const lines = await fetchFile(repoPath, file.newPath, "working");
    setFullFileLines(lines);
    return lines;
  }

  async function expand(hunkIndex: number, direction: "up" | "down", amount?: number) {
    const lines = fullFileLines ?? await loadFullFile();
    setHunks(prev => expandHunkContext(prev, lines, hunkIndex, direction, amount));
  }

  function openFileView() {
    const params = new URLSearchParams({ repoPath, path: fileId, ref: gitRef, repoName });
    window.open(`/view-file?${params}`, "_blank");
  }

  return (
    <div className="diff-view">
      <div className="diff-view-header-sticky" ref={headerRef}>
        <div className="diff-view-header">
          <button
            className="diff-view-collapse-toggle"
            aria-label={collapsed ? "Expand file" : "Collapse file"}
            onClick={toggleCollapsed}
          >
            <span className={`diff-view-collapse-chevron${collapsed ? "" : " diff-view-collapse-chevron-open"}`} />
          </button>
          <span className="diff-view-title">{repoName} &rsaquo; {file.newPath || file.oldPath}</span>
          <button onClick={openFileView}>View File</button>
        </div>
      </div>
      {showUncommittedBanner && (
        <div className="uncommitted-banner">Viewing uncommitted changes</div>
      )}
      {!collapsed && (
        <div
          className={`diff-view-body${isNewFile ? " diff-view-body-single" : ""}`}
          ref={bodyRef}
          style={isNewFile ? undefined : { gridTemplateColumns: `${paneSplit}% 4px ${100 - paneSplit}%` }}
        >
          {isNewFile ? (
            <Pane
              hunks={hunks} side="new" lang={lang} repoName={repoName} fileId={fileId} comments={comments}
              onExpand={expand} fileLineCount={fullFileLines?.length ?? null}
            />
          ) : (
            <>
              <Pane
                hunks={hunks} side="old" lang={lang} repoName={repoName} fileId={fileId} comments={comments}
                onExpand={expand} fileLineCount={fullFileLines?.length ?? null}
              />
              <div className="diff-pane-divider" role="separator" aria-orientation="vertical" onMouseDown={onDividerMouseDown} />
              <Pane
                hunks={hunks} side="new" lang={lang} repoName={repoName} fileId={fileId} comments={comments}
                onExpand={expand} fileLineCount={fullFileLines?.length ?? null}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

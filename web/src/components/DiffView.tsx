import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import type { CommentThread as CommentThreadData, DiffFile, DiffHunk, DiffLine } from "../types";
import { detectLanguage } from "../lib/language";
import { expandHunkContext } from "../lib/expandContext";
import { pairHunkLines, type PairedRow } from "../lib/pairLines";
import type { SelectionState } from "../lib/selection";
import { fetchFile } from "../api/client";
import { CommentThread } from "./CommentThread";

const LINE_SPAN_RE = /<code[^>]*>([\s\S]*)<\/code>/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function highlightLineInner(content: string, lang: string): Promise<string> {
  // shiki's codeToHtml always wraps a single line in its own <pre><code>...</code></pre>.
  // Keeping that wrapper makes every diff line render as its own boxed/margined block
  // (browser default `pre { margin }` plus shiki's own per-<pre> background-color), so
  // we discard the <pre>/<code> shell and keep only the highlighted <span> content.
  const html = await codeToHtml(content || " ", { lang, theme: "github-dark" });
  const match = LINE_SPAN_RE.exec(html);
  return match ? match[1] : escapeHtml(content);
}

const MARKERS: Record<DiffLine["type"], string> = { add: "+", del: "-", context: "" };

function Line({ line, lang, repoName, side, selected, onClick, onShiftClick }: {
  line: DiffLine; lang: string; repoName: string; side: "old" | "new";
  selected: boolean;
  onClick: (line: number, shift: boolean) => void;
  onShiftClick: (line: number) => void;
}) {
  const [html, setHtml] = useState<string>(() => escapeHtml(line.content));
  useEffect(() => {
    let cancelled = false;
    highlightLineInner(line.content, lang).then(result => {
      if (!cancelled) setHtml(result);
    }).catch(() => setHtml(escapeHtml(line.content)));
    return () => { cancelled = true; };
  }, [line.content, lang]);

  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;

  return (
    <div
      className={`diff-line diff-line-${line.type}${selected ? " diff-line-selected" : ""}`}
      data-line-number={lineNumber}
      onMouseDown={e => {
        // mousedown (not click): `.diff-pane` has user-select:text for copy/paste,
        // and shift+click on selectable text competes with the browser's native
        // "extend text selection" gesture — some browsers suppress the click event
        // entirely when the mouseup follows a selection change, making shift-click
        // range selection flaky. mousedown always fires, and preventDefault on the
        // shift case stops the native selection from hijacking the gesture.
        if (lineNumber == null) return;
        if (e.shiftKey) {
          e.preventDefault();
          onShiftClick(lineNumber);
        } else {
          onClick(lineNumber, false);
        }
      }}
    >
      <span className="diff-line-number">{lineNumber ?? ""}</span>
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
  onLineClick: (side: "old" | "new", line: number) => void;
  onLineShiftClick: (side: "old" | "new", line: number) => void;
  onCreateThread: (side: "old" | "new", lineStart: number, lineEnd: number, body: string, pending: boolean) => void;
  onCancelSelection: () => void;
  onReply: (threadId: string, body: string, pending: boolean) => void;
  onEdit: (threadId: string, commentId: string, body: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
}

function Composer({ onSubmit, onCancel }: {
  onSubmit: (body: string, pending: boolean) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="comment-composer">
      <textarea
        placeholder="Leave a comment..." value={draft} autoFocus
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
      />
      <div className="comment-reply-actions">
        <button onClick={() => { onSubmit(draft, false); setDraft(""); }}>Add single comment</button>
        <button onClick={() => { onSubmit(draft, true); setDraft(""); }}>Add to review</button>
        <button className="comment-cancel-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function HunkHeader({ hunk, hunkIndex, onExpand }: {
  hunk: DiffHunk; hunkIndex: number; onExpand: (hunkIndex: number, direction: "up" | "down") => void;
}) {
  return (
    <div className="diff-hunk-header">
      <span>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</span>
      <span className="diff-hunk-header-actions">
        <button aria-label="Expand above" onClick={() => onExpand(hunkIndex, "up")}>&#8963;</button>
        <button aria-label="Expand below" onClick={() => onExpand(hunkIndex, "down")}>&#8964;</button>
      </span>
    </div>
  );
}

function Pane({ hunks, side, lang, repoName, comments, onExpand, showHeaders = true }: {
  hunks: DiffHunk[]; side: "old" | "new"; lang: string; repoName: string; comments: CommentHandlers;
  onExpand: (hunkIndex: number, direction: "up" | "down") => void;
  showHeaders?: boolean;
}) {
  return (
    <div className="diff-pane" data-side={side}>
      {hunks.map((hunk, hi) => {
        const rows: PairedRow[] = pairHunkLines(hunk.lines);
        return (
          <div key={hi} className="diff-hunk">
            {showHeaders && <HunkHeader hunk={hunk} hunkIndex={hi} onExpand={onExpand} />}
            {rows.map((row, ri) => {
              const l = row[side];
              if (!l) return <EmptyLine key={ri} />;

              const lineNumber = side === "old" ? l.oldLineNumber : l.newLineNumber;
              const selected = Boolean(
                comments.selection && comments.selection.side === side && lineNumber != null &&
                lineNumber >= comments.selection.start && lineNumber <= comments.selection.end,
              );
              const threadsHere = comments.threads.filter(
                t => t.side === side && lineNumber != null && t.lineEnd === lineNumber,
              );
              const showComposer = Boolean(
                comments.selection && comments.selection.side === side && lineNumber === comments.selection.end &&
                threadsHere.length === 0,
              );
              return (
                <div key={ri}>
                  <Line
                    line={l} lang={lang} repoName={repoName} side={side} selected={selected}
                    onClick={(line) => comments.onLineClick(side, line)}
                    onShiftClick={(line) => comments.onLineShiftClick(side, line)}
                  />
                  {threadsHere.map(thread => (
                    <CommentThread
                      key={thread.id} thread={thread}
                      onReply={comments.onReply} onEdit={comments.onEdit} onDelete={comments.onDelete}
                    />
                  ))}
                  {showComposer && comments.selection && (
                    <Composer
                      onSubmit={(body, pending) => comments.onCreateThread(
                        side, comments.selection!.start, comments.selection!.end, body, pending,
                      )}
                      onCancel={comments.onCancelSelection}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function DiffView({ file, repoPath, repoName, baseRef, comments }: {
  file: DiffFile; repoPath: string; repoName: string; baseRef: string;
  comments: CommentHandlers;
}) {
  const [hunks, setHunks] = useState<DiffHunk[]>(file.hunks);
  const [viewingFullFile, setViewingFullFile] = useState(false);
  const [fullFileLines, setFullFileLines] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lang = detectLanguage(file.newPath || file.oldPath);

  useEffect(() => setHunks(file.hunks), [file]);
  void baseRef;

  async function loadFullFile() {
    const lines = await fetchFile(repoPath, file.newPath, "working");
    setFullFileLines(lines);
    return lines;
  }

  async function expand(hunkIndex: number, direction: "up" | "down") {
    const lines = fullFileLines ?? await loadFullFile();
    setHunks(prev => expandHunkContext(prev, lines, hunkIndex, direction));
  }

  async function toggleViewFile() {
    if (!viewingFullFile) await loadFullFile();
    setViewingFullFile(v => !v);
  }

  const fullFileHunks: DiffHunk[] = fullFileLines
    ? [{
      oldStart: 1, oldLines: fullFileLines.length, newStart: 1, newLines: fullFileLines.length,
      lines: fullFileLines.map((content, idx) => (
        { type: "context" as const, oldLineNumber: idx + 1, newLineNumber: idx + 1, content }
      )),
    }]
    : [];

  return (
    <div className="diff-view">
      <div className="diff-view-header-sticky">
        <div className="diff-view-header">
          <button
            className="diff-view-collapse-toggle"
            aria-label={collapsed ? "Expand file" : "Collapse file"}
            onClick={() => setCollapsed(c => !c)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <span className="diff-view-title">{repoName} &rsaquo; {file.newPath || file.oldPath}</span>
          <button onClick={toggleViewFile}>{viewingFullFile ? "View Diff" : "View File"}</button>
        </div>
      </div>
      {!collapsed && (
        <div className="diff-view-body">
          {viewingFullFile && fullFileLines ? (
            <Pane
              hunks={fullFileHunks} side="new" lang={lang} repoName={repoName} comments={comments}
              onExpand={expand} showHeaders={false}
            />
          ) : (
            <>
              <Pane hunks={hunks} side="old" lang={lang} repoName={repoName} comments={comments} onExpand={expand} />
              <Pane hunks={hunks} side="new" lang={lang} repoName={repoName} comments={comments} onExpand={expand} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

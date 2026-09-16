import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import type { CommentThread as CommentThreadData, DiffFile, DiffHunk, DiffLine } from "../types";
import { detectLanguage } from "../lib/language";
import { expandHunkContext } from "../lib/expandContext";
import type { SelectionState } from "../lib/selection";
import { fetchFile } from "../api/client";
import { CommentThread } from "./CommentThread";

function Line({ line, lang, repoName, side, selected, onClick, onShiftClick }: {
  line: DiffLine; lang: string; repoName: string; side: "old" | "new";
  selected: boolean;
  onClick: (line: number, shift: boolean) => void;
  onShiftClick: (line: number) => void;
}) {
  const [html, setHtml] = useState<string>(line.content);
  useEffect(() => {
    let cancelled = false;
    codeToHtml(line.content || " ", { lang, theme: "github-dark" }).then(result => {
      if (!cancelled) setHtml(result);
    }).catch(() => setHtml(line.content));
    return () => { cancelled = true; };
  }, [line.content, lang]);

  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;

  return (
    <div
      className={`diff-line diff-line-${line.type}${selected ? " diff-line-selected" : ""}`}
      data-line-number={lineNumber}
      onClick={e => {
        if (lineNumber == null) return;
        if (e.shiftKey) onShiftClick(lineNumber);
        else onClick(lineNumber, false);
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} data-repo={repoName} />
    </div>
  );
}

interface CommentHandlers {
  threads: CommentThreadData[];
  selection: SelectionState;
  onLineClick: (side: "old" | "new", line: number) => void;
  onLineShiftClick: (side: "old" | "new", line: number) => void;
  onCreateThread: (side: "old" | "new", lineStart: number, lineEnd: number, body: string, pending: boolean) => void;
  onReply: (threadId: string, body: string, pending: boolean) => void;
  onEdit: (threadId: string, commentId: string, body: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
}

function Composer({ onSubmit }: { onSubmit: (body: string, pending: boolean) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="comment-composer">
      <textarea placeholder="Leave a comment..." value={draft} onChange={e => setDraft(e.target.value)} />
      <div className="comment-reply-actions">
        <button onClick={() => { onSubmit(draft, false); setDraft(""); }}>Add single comment</button>
        <button onClick={() => { onSubmit(draft, true); setDraft(""); }}>Add to review</button>
      </div>
    </div>
  );
}

function Pane({ hunks, side, lang, repoName, comments }: {
  hunks: DiffHunk[]; side: "old" | "new"; lang: string; repoName: string; comments: CommentHandlers;
}) {
  return (
    <div className="diff-pane" data-side={side}>
      {hunks.map((hunk, hi) => (
        <div key={hi} className="diff-hunk">
          {hunk.lines
            .filter(l => side === "old" ? l.type !== "add" : l.type !== "del")
            .map((l, li) => {
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
                <div key={li}>
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
                    />
                  )}
                </div>
              );
            })}
        </div>
      ))}
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

  return (
    <div className="diff-view">
      <div className="diff-view-header">
        <span>{repoName} &rsaquo; {file.newPath || file.oldPath}</span>
        <button onClick={toggleViewFile}>{viewingFullFile ? "View Diff" : "View File"}</button>
      </div>
      <div className="diff-view-body">
        {viewingFullFile && fullFileLines ? (
          <Pane
            hunks={[{ oldStart: 1, oldLines: fullFileLines.length, newStart: 1, newLines: fullFileLines.length,
              lines: fullFileLines.map((content, idx) => ({ type: "context", oldLineNumber: idx + 1, newLineNumber: idx + 1, content })) }]}
            side="new" lang={lang} repoName={repoName} comments={comments}
          />
        ) : (
          <>
            <Pane hunks={hunks} side="old" lang={lang} repoName={repoName} comments={comments} />
            <Pane hunks={hunks} side="new" lang={lang} repoName={repoName} comments={comments} />
          </>
        )}
      </div>
      {!viewingFullFile && hunks.map((_, hi) => (
        <div key={hi} className="diff-expand-controls">
          <button onClick={() => expand(hi, "up")}>Expand above</button>
          <button onClick={() => expand(hi, "down")}>Expand below</button>
        </div>
      ))}
    </div>
  );
}

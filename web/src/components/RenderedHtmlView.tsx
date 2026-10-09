import { useEffect, useRef, useState } from "react";
import type { DiffFile, DiffHunk } from "../types";
import { fetchRendered } from "../api/client";
import { changedLines, markersFor, parseBridgeMessage, type PreviewRect } from "../lib/renderedView";
import { Composer } from "./Composer";
import { CommentThread } from "./CommentThread";
import type { CommentHandlers } from "./DiffView";

type Side = "old" | "new";
type Doc = { html: string } | { error: true } | null;
/** What the bubble shows, and where (in its preview's coordinates). */
type Bubble =
  | { kind: "compose"; side: Side; line: number; rect: PreviewRect }
  | { kind: "thread"; side: Side; threadId: string; rect: PreviewRect };

const DEFAULT_FRAME_HEIGHT = 520;
const BUBBLE_GAP = 8;

/**
 * Old/new previews of an HTML file in sandboxed iframes. The iframes run a
 * bridge script (see src/git/htmlAnnotate.ts) that reports clicks as source
 * lines; threads stay anchored to those lines, so they behave exactly as in
 * the source view.
 */
export function RenderedHtmlView({ file, repoPath, fromRef, toRef, hunks, comments }: {
  file: DiffFile; repoPath: string; fromRef?: string; toRef?: string;
  hunks: DiffHunk[]; comments: CommentHandlers;
}) {
  const [scripts, setScripts] = useState(false);
  const [docs, setDocs] = useState<Record<Side, Doc>>({ old: null, new: null });
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [heights, setHeights] = useState<Partial<Record<Side, number>>>({});
  const frames = { old: useRef<HTMLIFrameElement>(null), new: useRef<HTMLIFrameElement>(null) };
  const sides: Side[] = [
    ...(file.status === "added" ? [] : ["old" as const]),
    ...(file.status === "deleted" ? [] : ["new" as const]),
  ];

  useEffect(() => {
    let cancelled = false;
    setDocs({ old: null, new: null });
    for (const side of sides) {
      fetchRendered({
        repoPath, path: side === "old" ? file.oldPath : file.newPath, side, from: fromRef, to: toRef, scripts,
      }).then(
        html => { if (!cancelled) setDocs(prev => ({ ...prev, [side]: { html } })); },
        () => { if (!cancelled) setDocs(prev => ({ ...prev, [side]: { error: true } })); },
      );
    }
    return () => { cancelled = true; };
  }, [repoPath, file.oldPath, file.newPath, file.status, fromRef, toRef, scripts]);

  function sync(side: Side) {
    const win = frames[side].current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "dv-changed", side, lines: changedLines(hunks, side) }, "*");
    win.postMessage({ type: "dv-markers", markers: markersFor(comments.threads, hunks, side) }, "*");
  }

  useEffect(() => {
    for (const side of sides) sync(side);
  }, [docs, hunks, comments.threads]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const side = (["old", "new"] as const).find(s => e.source != null && e.source === frames[s].current?.contentWindow);
      if (!side) return;
      const msg = parseBridgeMessage(e.data);
      if (!msg) return;
      if (msg.type === "dv-click") setBubble({ kind: "compose", side, line: msg.line, rect: msg.rect });
      else if (msg.type === "dv-marker-click") setBubble({ kind: "thread", side, threadId: msg.threadId, rect: msg.rect });
      else setHeights(prev => ({ ...prev, [side]: msg.height }));
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setBubble(null);
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function renderBubble(b: Bubble) {
    const thread = b.kind === "thread" ? comments.threads.find(t => t.id === b.threadId) : undefined;
    if (b.kind === "thread" && !thread) return null;
    return (
      <div
        className="rendered-view-bubble" role="dialog"
        style={{ top: b.rect.top + b.rect.height + BUBBLE_GAP, "--bubble-left": `${b.rect.left}px` } as React.CSSProperties}
      >
        <button className="btn-icon rendered-view-bubble-close" aria-label="Close" onClick={() => setBubble(null)}>×</button>
        {thread ? (
          <CommentThread
            thread={thread}
            onReply={comments.onReply} onEdit={comments.onEdit} onDelete={comments.onDelete}
            onResolve={comments.onResolve} onFlag={comments.onFlag} onRead={comments.onRead}
            onNavigate={comments.onNavigate} canNavigate={comments.navAvailability[thread.id]}
          />
        ) : b.kind === "compose" && (
          <>
            <div className="rendered-view-target">Commenting on {b.side} line {b.line}</div>
            <Composer
              key={`${b.side}:${b.line}`}
              quotedText={null}
              onCancel={() => setBubble(null)}
              onSubmit={async (body, pending) => {
                const result = await comments.onCreateThread(b.side, b.line, b.line, body, pending);
                if (result !== false) setBubble(null);
                return result;
              }}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rendered-view">
      <label className="rendered-view-scripts">
        <input type="checkbox" checked={scripts} onChange={e => setScripts(e.target.checked)} />
        Run scripts
      </label>
      <div className={`rendered-view-panes${sides.length === 1 ? " rendered-view-panes-single" : ""}`}>
        {sides.map(side => {
          const doc = docs[side];
          return (
            <div className="rendered-view-pane" key={side}>
              {doc && "error" in doc
                ? <p className="rendered-view-error">Could not load preview.</p>
                : (
                  <iframe
                    ref={frames[side]} title={`${side} rendered`} sandbox="allow-scripts"
                    srcDoc={doc?.html ?? ""} onLoad={() => sync(side)}
                    style={{ height: heights[side] ?? DEFAULT_FRAME_HEIGHT }}
                  />
                )}
              {bubble?.side === side && renderBubble(bubble)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

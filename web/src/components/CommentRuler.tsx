import { useEffect, useState, type MouseEvent, type RefObject } from "react";
import type { CommentThread } from "../types";

interface Tick {
  threadId: string;
  commentId: string;
  /** Position of the thread within the scroll content, 0 (top) to 1 (bottom). */
  fraction: number;
  pending: boolean;
  label: string;
}

interface Layout {
  ticks: Tick[];
  /** Visible range of the scroll content, as fractions of its full height. */
  viewTop: number;
  viewHeight: number;
  /** Width of the container's native scrollbar, so the ruler sits just left of it. */
  scrollbarWidth: number;
}

/** Room left for macOS overlay scrollbars, which take up no layout width. */
const OVERLAY_SCROLLBAR_ALLOWANCE = 14;

function tickLabel(thread: CommentThread, pending: boolean): string {
  const firstLine = thread.comments[0].body.split("\n")[0].slice(0, 80);
  return [pending && "Pending", `${thread.file}:${thread.lineStart}`, firstLine].filter(Boolean).join(" · ");
}

/**
 * An overview ruler beside the scroll container's scrollbar: a box showing
 * exactly which part of the content is on screen, plus one clickable tick
 * per unresolved thread at its position in the content. Everything is
 * measured against the same scroll height, so a tick is inside the box
 * exactly when its thread is on screen. Re-measured on scroll and resize,
 * since diffs expand, collapse, and restyle after the first render.
 */
export function CommentRuler({ threads, scrollRef }: {
  threads: CommentThread[];
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = container.scrollHeight;
      if (height <= 0) return setLayout(null);
      const contentTop = container.getBoundingClientRect().top - container.scrollTop;
      const ticks = threads
        .filter(t => !t.resolved && t.comments.length > 0)
        .flatMap(t => {
          const commentId = t.comments[0].id;
          const el = document.getElementById(`comment-${commentId}`);
          if (!el) return [];
          const pending = t.comments.some(c => c.pending);
          return [{
            threadId: t.id, commentId, pending, label: tickLabel(t, pending),
            fraction: (el.getBoundingClientRect().top - contentTop) / height,
          }];
        });
      const next: Layout = {
        ticks,
        viewTop: container.scrollTop / height,
        viewHeight: container.clientHeight / height,
        scrollbarWidth: container.offsetWidth - container.clientWidth,
      };
      setLayout(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };

    schedule();
    container.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    Array.from(container.children).forEach(el => resizeObserver?.observe(el));
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
    };
  }, [threads, scrollRef]);

  function jumpTo(e: MouseEvent<HTMLDivElement>) {
    const container = scrollRef.current;
    if (!container) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.height <= 0) return;
    const fraction = (e.clientY - rect.top) / rect.height;
    const top = fraction * container.scrollHeight - container.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  const scrollbarWidth = layout?.scrollbarWidth || OVERLAY_SCROLLBAR_ALLOWANCE;

  return (
    <div className="comment-ruler" style={{ right: scrollbarWidth }} onClick={jumpTo}>
      {layout && (
        <div className="comment-ruler-viewport" style={{ top: pct(layout.viewTop), height: pct(layout.viewHeight) }} />
      )}
      {layout?.ticks.map(t => (
        <button
          key={t.threadId}
          type="button"
          className={`comment-ruler-tick${t.pending ? " comment-ruler-tick-pending" : ""}`}
          style={{ top: pct(t.fraction) }}
          title={t.label}
          aria-label={t.label}
          onClick={e => {
            e.stopPropagation();
            document.getElementById(`comment-${t.commentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      ))}
    </div>
  );
}

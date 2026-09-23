import { useEffect, useState, type RefObject } from "react";
import type { CommentThread } from "../types";

interface Marker {
  threadId: string;
  /** Position of the thread within the scroll content, 0 (top) to 1 (bottom). */
  fraction: number;
  pending: boolean;
}

/**
 * Tick marks laid over the scroll container's scrollbar, one per unresolved
 * thread, at the thread's position in the scrolled content. Positions are
 * re-measured whenever the content scrolls or resizes, since diffs expand,
 * collapse, and load syntax highlighting after the first render.
 */
export function CommentScrollMarkers({ threads, scrollRef }: {
  threads: CommentThread[];
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const [markers, setMarkers] = useState<Marker[]>([]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const contentTop = container.getBoundingClientRect().top - container.scrollTop;
      const height = container.scrollHeight;
      const next = height <= 0 ? [] : threads
        .filter(t => !t.resolved && t.comments.length > 0)
        .flatMap(t => {
          const el = document.getElementById(`comment-${t.comments[0].id}`);
          if (!el) return [];
          const fraction = (el.getBoundingClientRect().top - contentTop) / height;
          return [{ threadId: t.id, fraction, pending: t.comments.some(c => c.pending) }];
        });
      setMarkers(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
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

  return (
    <div className="comment-scroll-markers" aria-hidden="true">
      {markers.map(m => (
        <div
          key={m.threadId}
          className={`comment-scroll-marker${m.pending ? " comment-scroll-marker-pending" : ""}`}
          style={{ top: `${Math.round(m.fraction * 1000) / 10}%` }}
        />
      ))}
    </div>
  );
}

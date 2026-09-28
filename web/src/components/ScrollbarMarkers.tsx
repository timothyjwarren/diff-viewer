import { useEffect, useState, type RefObject } from "react";
import type { CommentThread } from "../types";
import { tickFraction } from "../lib/scrollbarTicks";

/** Must match `min-height` of `main::-webkit-scrollbar-thumb` in App.css. */
export const SCROLLBAR_MIN_THUMB = 24;

/** Strip width when the scrollbar takes no layout width (e.g. overlay scrollbars). */
const FALLBACK_WIDTH = 10;

interface Tick {
  threadId: string;
  /** Position on the scrollbar track, 0 (top) to 1 (bottom). */
  fraction: number;
  status: "open" | "pending" | "resolved";
  flagged: boolean;
  /** Has an agent comment the user hasn't had on screen yet. */
  unread: boolean;
  label: string;
}

const STATUS_LABELS = { open: null, pending: "Pending", resolved: "Resolved" };

function hasUnread(thread: CommentThread): boolean {
  return thread.comments.some(c => c.author === "agent" && !c.readByUser);
}

/** Paint order: later ticks draw over earlier ones where they overlap. */
function tickPriority(thread: CommentThread): number {
  if (hasUnread(thread)) return 3;
  if (thread.flagged) return 2;
  return thread.resolved ? 0 : 1;
}

function tickStatus(thread: CommentThread): Tick["status"] {
  if (thread.resolved) return "resolved";
  return thread.comments.some(c => c.pending) ? "pending" : "open";
}

function tickLabel(thread: CommentThread, status: Tick["status"]): string {
  const firstLine = thread.comments[0].body.split("\n")[0].slice(0, 80);
  return [
    thread.flagged && "Flagged", hasUnread(thread) && "Unread", STATUS_LABELS[status],
    `${thread.file}:${thread.lineStart}`, firstLine,
  ].filter(Boolean).join(" · ");
}

function tickClassName(tick: Tick): string {
  return [
    "scrollbar-marker",
    tick.status !== "open" && `scrollbar-marker-${tick.status}`,
    tick.flagged && "scrollbar-marker-flagged",
    tick.unread && "scrollbar-marker-unread",
  ].filter(Boolean).join(" ");
}

/**
 * Clickable tick marks laid over the scroll container's scrollbar, one per
 * thread, positioned to line up with the scrollbar thumb (see
 * `tickFraction`). Re-measured on scroll and resize, since diffs expand,
 * collapse, and restyle after the first render.
 */
export function ScrollbarMarkers({ threads, scrollRef }: {
  threads: CommentThread[];
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [width, setWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { scrollHeight, clientHeight } = container;
      setWidth(container.offsetWidth - container.clientWidth || FALLBACK_WIDTH);
      if (scrollHeight <= 0) return setTicks([]);
      const contentTop = container.getBoundingClientRect().top - container.scrollTop;
      const next = threads
        .filter(t => t.comments.length > 0)
        .sort((a, b) => tickPriority(a) - tickPriority(b))
        .flatMap(t => {
          const el = document.getElementById(`thread-${t.id}`);
          if (!el) return [];
          const rect = el.getBoundingClientRect();
          const status = tickStatus(t);
          const fraction = tickFraction({
            contentCenter: rect.top + rect.height / 2 - contentTop,
            scrollHeight, clientHeight, minThumb: SCROLLBAR_MIN_THUMB,
          });
          return [{
            threadId: t.id, status, flagged: Boolean(t.flagged), unread: hasUnread(t),
            label: tickLabel(t, status), fraction,
          }];
        });
      setTicks(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
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
    <div className="scrollbar-markers" style={{ width }}>
      {ticks.map(t => (
        <button
          key={t.threadId}
          type="button"
          className={tickClassName(t)}
          style={{ top: `${Math.round(t.fraction * 1000) / 10}%` }}
          title={t.label}
          aria-label={t.label}
          onClick={() => {
            document.getElementById(`thread-${t.threadId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      ))}
    </div>
  );
}

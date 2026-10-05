import { useEffect, useState, type RefObject } from "react";
import type { CommentThread } from "../types";
import { tickFraction } from "../lib/scrollbarTicks";
import { fileAnchorIdFor } from "../lib/fileAnchor";

/** Must match `min-height` of `main::-webkit-scrollbar-thumb` in App.css. */
export const SCROLLBAR_MIN_THUMB = 24;

/** Strip width when the scrollbar takes no layout width (e.g. overlay scrollbars). */
const FALLBACK_WIDTH = 16;

interface Tick {
  threadId: string;
  /** Position on the scrollbar track, 0 (top) to 1 (bottom). */
  fraction: number;
  status: "open" | "pending" | "resolved";
  flagged: boolean;
  /** Has an agent comment the user hasn't had on screen yet. */
  unread: boolean;
  /** Stands for a collapsed file's threads, which aren't on the page. */
  collapsed: boolean;
  /** Paint order, from `tickPriority`. */
  priority: number;
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
    tick.collapsed && "scrollbar-marker-collapsed",
  ].filter(Boolean).join(" ");
}

/**
 * Clickable tick marks laid over the scroll container's scrollbar, one per
 * thread, positioned to line up with the scrollbar thumb (see
 * `tickFraction`). Re-measured on scroll and resize, since diffs expand,
 * collapse, and restyle after the first render. The threads of a collapsed
 * file aren't rendered, so the file gets a single outlined tick at its
 * header, styled as its most important open thread (none if all are
 * resolved). Clicking it calls `onExpandFile` before scrolling to that thread.
 */
export function ScrollbarMarkers({ threads, scrollRef, onExpandFile = () => {} }: {
  threads: CommentThread[];
  scrollRef: RefObject<HTMLElement | null>;
  onExpandFile?: (repoPath: string, file: string) => void;
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
      const measure = (t: CommentThread, el: HTMLElement, collapsed: boolean, label?: string): Tick => {
        const rect = el.getBoundingClientRect();
        const status = tickStatus(t);
        return {
          threadId: t.id, status, flagged: Boolean(t.flagged), unread: hasUnread(t),
          collapsed, priority: tickPriority(t), label: label ?? tickLabel(t, status),
          fraction: tickFraction({
            contentCenter: rect.top + rect.height / 2 - contentTop,
            scrollHeight, clientHeight, minThumb: SCROLLBAR_MIN_THUMB,
          }),
        };
      };
      const shown: Tick[] = [];
      const hidden = new Map<HTMLElement, CommentThread[]>();
      for (const t of threads) {
        if (t.comments.length === 0) continue;
        const el = document.getElementById(`thread-${t.id}`);
        if (el) {
          shown.push(measure(t, el, false));
          continue;
        }
        const header = document.getElementById(fileAnchorIdFor(t.repoPath, t.file));
        if (header) hidden.set(header, [...(hidden.get(header) ?? []), t]);
      }
      for (const [header, group] of hidden) {
        const open = group.filter(t => !t.resolved);
        if (open.length === 0) continue;
        const top = open.reduce((best, t) => (tickPriority(t) > tickPriority(best) ? t : best));
        const count = `${open.length} open thread${open.length === 1 ? "" : "s"}`;
        shown.push(measure(top, header, true, `${count} in ${top.file} (collapsed)`));
      }
      const next = shown.sort((a, b) => a.priority - b.priority);
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
            const scrollToThread = () => document.getElementById(`thread-${t.threadId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
            const thread = threads.find(th => th.id === t.threadId);
            if (!document.getElementById(`thread-${t.threadId}`) && thread) {
              onExpandFile(thread.repoPath, thread.file);
              // Two frames: the expanded file renders on the next one.
              requestAnimationFrame(() => requestAnimationFrame(scrollToThread));
            } else {
              scrollToThread();
            }
          }}
        />
      ))}
    </div>
  );
}

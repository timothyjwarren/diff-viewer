import { describe, it, expect, vi } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { CommentRuler } from "./CommentRuler";
import type { CommentThread } from "../types";

function thread(id: string, overrides: Partial<CommentThread> = {}, pending = false): CommentThread {
  return {
    id, repoPath: "/r", file: "a.ts", lineStart: 7, lineEnd: 7, side: "new", resolved: false,
    pinnedRef: "abc", outdated: false,
    comments: [{ id: `${id}-c`, author: "user", body: "first line\nsecond line", pending, createdAt: "2026-01-01T00:00:00Z" }],
    ...overrides,
  };
}

function rectAt(top: number, height = 20): DOMRect {
  return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) };
}

/**
 * A scroll container 200px tall with 1000px of content, scrolled 300px
 * down, holding one comment element per `offsets` entry (content offsets).
 */
function Harness({ threads, offsets }: { threads: CommentThread[]; offsets: Record<string, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTop = 300;
  return (
    <>
      <div
        data-testid="scroller"
        ref={el => {
          ref.current = el;
          if (!el) return;
          Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
          Object.defineProperty(el, "clientHeight", { value: 200, configurable: true });
          el.scrollTop = scrollTop;
          el.getBoundingClientRect = () => rectAt(0, 200);
        }}
      >
        {Object.entries(offsets).map(([commentId, offset]) => (
          <div
            key={commentId}
            id={`comment-${commentId}`}
            ref={el => { if (el) el.getBoundingClientRect = () => rectAt(offset - scrollTop); }}
          />
        ))}
      </div>
      <CommentRuler threads={threads} scrollRef={ref} />
    </>
  );
}

const ticks = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>(".comment-ruler-tick"));

describe("CommentRuler", () => {
  it("places a tick for each unresolved thread at its offset in the scroll content", async () => {
    const { container } = render(
      <Harness threads={[thread("t1"), thread("t2")]} offsets={{ "t1-c": 250, "t2-c": 900 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(2));
    expect(ticks(container).map(t => t.style.top)).toEqual(["25%", "90%"]);
  });

  it("draws the viewport box over exactly the visible range", async () => {
    const { container } = render(<Harness threads={[]} offsets={{}} />);
    await waitFor(() => {
      const box = container.querySelector<HTMLElement>(".comment-ruler-viewport");
      expect(box?.style.top).toBe("30%");
      expect(box?.style.height).toBe("20%");
    });
  });

  it("skips resolved threads and threads whose comments aren't rendered", async () => {
    const { container } = render(
      <Harness threads={[thread("t1", { resolved: true }), thread("t2"), thread("t3")]} offsets={{ "t1-c": 100, "t2-c": 500 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
  });

  it("marks pending threads and labels ticks with the file, line, and first line of the comment", async () => {
    const { container } = render(
      <Harness threads={[thread("t1", {}, true), thread("t2")]} offsets={{ "t1-c": 100, "t2-c": 500 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(2));
    expect(ticks(container)[0]).toHaveClass("comment-ruler-tick-pending");
    expect(ticks(container)[0]).toHaveAttribute("title", "Pending · a.ts:7 · first line");
    expect(ticks(container)[1]).toHaveAttribute("title", "a.ts:7 · first line");
  });

  it("scrolls a thread into view when its tick is clicked", async () => {
    const { container } = render(<Harness threads={[thread("t1")]} offsets={{ "t1-c": 600 }} />);
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
    const target = document.getElementById("comment-t1-c")!;
    target.scrollIntoView = vi.fn();
    fireEvent.click(ticks(container)[0]);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("centers the clicked point of the ruler in the viewport", () => {
    const { container, getByTestId } = render(<Harness threads={[]} offsets={{}} />);
    const ruler = container.querySelector<HTMLElement>(".comment-ruler")!;
    ruler.getBoundingClientRect = () => rectAt(0, 200);
    const scroller = getByTestId("scroller");
    scroller.scrollTo = vi.fn();
    fireEvent.click(ruler, { clientY: 100 });
    // Halfway down 1000px of content is 500; centering a 200px viewport there scrolls to 400.
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 400, behavior: "smooth" });
  });
});

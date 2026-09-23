import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { CommentScrollMarkers } from "./CommentScrollMarkers";
import type { CommentThread } from "../types";

function thread(id: string, overrides: Partial<CommentThread> = {}, pending = false): CommentThread {
  return {
    id, repoPath: "/r", file: "a.ts", lineStart: 1, lineEnd: 1, side: "new", resolved: false,
    pinnedRef: "abc", outdated: false,
    comments: [{ id: `${id}-c`, author: "user", body: "hi", pending, createdAt: "2026-01-01T00:00:00Z" }],
    ...overrides,
  };
}

function rectAt(top: number): DOMRect {
  return { top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: top, toJSON: () => ({}) };
}

/** A 1000px-tall scroll container holding one comment element per `tops` entry. */
function Harness({ threads, tops }: { threads: CommentThread[]; tops: Record<string, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={el => {
          ref.current = el;
          if (!el) return;
          Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
          el.getBoundingClientRect = () => rectAt(0);
        }}
      >
        {Object.entries(tops).map(([commentId, top]) => (
          <div key={commentId} id={`comment-${commentId}`} ref={el => { if (el) el.getBoundingClientRect = () => rectAt(top); }} />
        ))}
      </div>
      <CommentScrollMarkers threads={threads} scrollRef={ref} />
    </>
  );
}

describe("CommentScrollMarkers", () => {
  it("places a marker for each unresolved thread at its position in the scroll content", async () => {
    const { container } = render(
      <Harness threads={[thread("t1"), thread("t2")]} tops={{ "t1-c": 250, "t2-c": 900 }} />,
    );
    await waitFor(() => expect(container.querySelectorAll(".comment-scroll-marker")).toHaveLength(2));
    const tops = Array.from(container.querySelectorAll<HTMLElement>(".comment-scroll-marker")).map(m => m.style.top);
    expect(tops).toEqual(["25%", "90%"]);
  });

  it("skips resolved threads and threads whose comments aren't rendered", async () => {
    const { container } = render(
      <Harness
        threads={[thread("t1", { resolved: true }), thread("t2"), thread("t3")]}
        tops={{ "t1-c": 100, "t2-c": 500 }}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll(".comment-scroll-marker")).toHaveLength(1));
  });

  it("marks threads that hold pending comments", async () => {
    const { container } = render(
      <Harness threads={[thread("t1", {}, true), thread("t2")]} tops={{ "t1-c": 100, "t2-c": 500 }} />,
    );
    await waitFor(() => expect(container.querySelectorAll(".comment-scroll-marker")).toHaveLength(2));
    expect(container.querySelectorAll(".comment-scroll-marker-pending")).toHaveLength(1);
  });
});

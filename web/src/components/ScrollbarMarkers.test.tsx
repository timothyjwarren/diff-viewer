import { describe, it, expect, vi } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { ScrollbarMarkers } from "./ScrollbarMarkers";
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
 * A scroll container 200px tall with 1000px of content (so its thumb is
 * 40px, above the minimum), scrolled 300px down, holding one 20px thread
 * element per `offsets` entry (content offsets of the thread's top).
 */
function Harness({ threads, offsets }: { threads: CommentThread[]; offsets: Record<string, number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollTop = 300;
  return (
    <>
      <div
        ref={el => {
          ref.current = el;
          if (!el) return;
          Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
          Object.defineProperty(el, "clientHeight", { value: 200, configurable: true });
          el.scrollTop = scrollTop;
          el.getBoundingClientRect = () => rectAt(0, 200);
        }}
      >
        {Object.entries(offsets).map(([threadId, offset]) => (
          <div
            key={threadId}
            id={`thread-${threadId}`}
            ref={el => { if (el) el.getBoundingClientRect = () => rectAt(offset - scrollTop); }}
          />
        ))}
      </div>
      <ScrollbarMarkers threads={threads} scrollRef={ref} />
    </>
  );
}

const ticks = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>(".scrollbar-marker"));

describe("ScrollbarMarkers", () => {
  it("places a tick for each thread at its position", async () => {
    const { container } = render(
      <Harness threads={[thread("t1"), thread("t2")]} offsets={{ "t1": 250, "t2": 900 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(2));
    // Comment centers are 260 and 910 of 1000.
    expect(ticks(container).map(t => t.style.top)).toEqual(["26%", "91%"]);
  });

  it("skips threads that aren't rendered", async () => {
    const { container } = render(
      <Harness threads={[thread("t1"), thread("t2")]} offsets={{ "t1": 100 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
  });

  it("marks and labels resolved threads", async () => {
    const { container } = render(
      <Harness threads={[thread("t1", { resolved: true })]} offsets={{ "t1": 100 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
    expect(ticks(container)[0]).toHaveClass("scrollbar-marker-resolved");
    expect(ticks(container)[0]).toHaveAttribute("title", "Resolved · a.ts:7 · first line");
  });

  it("marks pending threads and labels ticks with the file, line, and first line of the comment", async () => {
    const { container } = render(
      <Harness threads={[thread("t1", {}, true), thread("t2")]} offsets={{ "t1": 100, "t2": 500 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(2));
    expect(ticks(container)[0]).toHaveClass("scrollbar-marker-pending");
    expect(ticks(container)[0]).toHaveAttribute("title", "Pending · a.ts:7 · first line");
    expect(ticks(container)[1]).toHaveAttribute("title", "a.ts:7 · first line");
  });

  it("marks and labels flagged threads", async () => {
    const { container } = render(
      <Harness threads={[thread("t1", { flagged: true })]} offsets={{ "t1": 100 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
    expect(ticks(container)[0]).toHaveClass("scrollbar-marker-flagged");
    expect(ticks(container)[0]).toHaveAttribute("title", "Flagged · a.ts:7 · first line");
  });

  it("marks threads with an unread agent comment, ignoring read ones and the user's own", async () => {
    const agent = (id: string, readByUser?: boolean) => ({
      id, author: "agent" as const, body: "reply", pending: false, readByUser, createdAt: "2026-01-01T00:01:00Z",
    });
    const unread = thread("t1");
    unread.comments.push(agent("a1"));
    const read = thread("t2");
    read.comments.push(agent("a2", true));
    const { container } = render(
      <Harness threads={[unread, read, thread("t3")]} offsets={{ "t1": 100, "t2": 300, "t3": 500 }} />,
    );
    await waitFor(() => expect(ticks(container)).toHaveLength(3));
    const byTitle = (prefix: string) => ticks(container).filter(t => t.title.startsWith(prefix));
    expect(byTitle("Unread")).toHaveLength(1);
    expect(container.querySelectorAll(".scrollbar-marker-unread")).toHaveLength(1);
  });

  it("combines flagged and unread on one tick", async () => {
    const t = thread("t1", { flagged: true });
    t.comments.push({ id: "a1", author: "agent", body: "reply", pending: false, createdAt: "2026-01-01T00:01:00Z" });
    const { container } = render(<Harness threads={[t]} offsets={{ "t1": 100 }} />);
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
    expect(ticks(container)[0]).toHaveClass("scrollbar-marker-flagged", "scrollbar-marker-unread");
    expect(ticks(container)[0]).toHaveAttribute("title", "Flagged · Unread · a.ts:7 · first line");
  });

  it("scrolls a thread into view when its tick is clicked", async () => {
    const { container } = render(<Harness threads={[thread("t1")]} offsets={{ "t1": 600 }} />);
    await waitFor(() => expect(ticks(container)).toHaveLength(1));
    const target = document.getElementById("thread-t1")!;
    target.scrollIntoView = vi.fn();
    fireEvent.click(ticks(container)[0]);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});

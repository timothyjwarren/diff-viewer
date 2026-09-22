import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommentThread } from "./CommentThread";
import type { CommentThread as CommentThreadData } from "../types";

const thread: CommentThreadData = {
  id: "t1", repoPath: "/r", file: "a.ts", lineStart: 1, lineEnd: 1, side: "new", resolved: false,
  pinnedRef: "abc123", outdated: false,
  comments: [
    { id: "c1", author: "user", body: "why is this here?", pending: false, createdAt: "2026-01-01T00:00:00Z" },
    { id: "c2", author: "agent", body: "it handles the edge case", pending: false, createdAt: "2026-01-01T00:01:00Z" },
  ],
};

describe("CommentThread", () => {
  it("renders comments and labels the agent's reply distinctly", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("why is this here?")).toBeInTheDocument();
    expect(screen.getByText("it handles the edge case")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("submits a reply with the chosen pending flag", () => {
    const onReply = vi.fn();
    render(<CommentThread thread={thread} onReply={onReply} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Reply..."), { target: { value: "thanks!" } });
    fireEvent.click(screen.getByText("Add single comment"));
    expect(onReply).toHaveBeenCalledWith("t1", "thanks!", false);
  });

  it("calls onDelete for a user's own comment", () => {
    const onDelete = vi.fn();
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getAllByText("Delete")[0]);
    expect(onDelete).toHaveBeenCalledWith("t1", "c1");
  });

  it("shows a working indicator only on an acked comment", () => {
    const ackedThread: CommentThreadData = {
      ...thread,
      comments: [
        { ...thread.comments[0], agentStatus: "acked" },
        thread.comments[1],
      ],
    };
    render(<CommentThread thread={ackedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByText("Agent is working on this")).toHaveLength(1);
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
  });

  it("shows a seen indicator on a seen-but-not-acked comment", () => {
    const seenThread: CommentThreadData = {
      ...thread,
      comments: [
        { ...thread.comments[0], agentStatus: "seen" },
        thread.comments[1],
      ],
    };
    render(<CommentThread thread={seenThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByText("Seen")).toHaveLength(1);
    expect(screen.queryByText("Agent is working on this")).not.toBeInTheDocument();
  });

  it("shows no indicator on an untouched comment", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent is working on this")).not.toBeInTheDocument();
  });

  it("shows no indicator on a cleared comment (terminal state, not a revert to seen)", () => {
    const clearedThread: CommentThreadData = {
      ...thread,
      comments: [
        { ...thread.comments[0], agentStatus: "cleared" },
        thread.comments[1],
      ],
    };
    render(<CommentThread thread={clearedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText("Seen")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent is working on this")).not.toBeInTheDocument();
  });

  it("shows an Outdated badge when the thread's commented lines have changed", () => {
    const outdatedThread: CommentThreadData = { ...thread, outdated: true };
    render(<CommentThread thread={outdatedThread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("Outdated")).toBeInTheDocument();
  });

  it("shows no Outdated badge for a current thread", () => {
    render(<CommentThread thread={thread} onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });
});

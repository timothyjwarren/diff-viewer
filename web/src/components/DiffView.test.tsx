import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DiffView, type CommentHandlers } from "./DiffView";
import type { CommentThread as CommentThreadData, DiffFile } from "../types";

const file: DiffFile = {
  repoPath: "/repo", oldPath: "a.ts", newPath: "a.ts", status: "modified",
  hunks: [{
    oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
    lines: [{ type: "context", oldLineNumber: 1, newLineNumber: 1, content: "one" }],
  }],
};

const fileWithMixedAdds: DiffFile = {
  repoPath: "/repo", oldPath: "a.ts", newPath: "a.ts", status: "modified",
  hunks: [{
    oldStart: 1, oldLines: 1, newStart: 1, newLines: 3,
    lines: [
      { type: "add", oldLineNumber: null, newLineNumber: 1, content: "committed addition" },
      { type: "add", oldLineNumber: null, newLineNumber: 2, content: "uncommitted addition", uncommitted: true },
    ],
  }],
};

const comments: CommentHandlers = {
  threads: [], selection: null, composerArmed: false, quotedText: null,
  onGutterMouseDown: vi.fn(), onGutterMouseEnter: vi.fn(), onCreateThread: vi.fn(),
  onCancelSelection: vi.fn(), onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
};

describe("DiffView", () => {
  it("shows an uncommitted-changes banner when showUncommittedBanner is true", () => {
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" showUncommittedBanner comments={comments} />,
    );
    expect(screen.getByText(/Viewing uncommitted changes/)).toBeInTheDocument();
  });

  it("shows no banner when showUncommittedBanner is false or omitted", () => {
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" showUncommittedBanner={false} comments={comments} />,
    );
    expect(screen.queryByText(/Viewing uncommitted changes/)).not.toBeInTheDocument();

    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" comments={comments} />,
    );
    expect(screen.queryByText(/Viewing uncommitted changes/)).not.toBeInTheDocument();
  });

  it("tints only the specific lines flagged uncommitted, not the whole file's other additions", () => {
    render(
      <DiffView file={fileWithMixedAdds} repoPath="/repo" repoName="repo:main" showUncommittedBanner comments={comments} />,
    );
    expect(screen.getByText("committed addition").closest(".diff-line")).not.toHaveClass("diff-line-uncommitted");
    expect(screen.getByText("uncommitted addition").closest(".diff-line")).toHaveClass("diff-line-uncommitted");
  });

  it("attaches a thread pinned to a committed line to that line's new (shifted) position, not its stale stored line", () => {
    // Committed content was just "target line" (canonical line 1); an
    // uncommitted edit inserted a line above it, so it now displays at
    // line 2 — the thread's canonical lineEnd (1) must not be taken at
    // face value against this view's own numbering.
    const fileWithShift: DiffFile = {
      repoPath: "/repo", oldPath: "a.ts", newPath: "a.ts", status: "modified",
      hunks: [{
        oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
        lines: [
          { type: "add", oldLineNumber: null, newLineNumber: 1, content: "inserted", uncommitted: true },
          { type: "context", oldLineNumber: 1, newLineNumber: 2, content: "target line" },
        ],
      }],
    };
    const thread: CommentThreadData = {
      id: "t1", repoPath: "/repo", file: "a.ts", lineStart: 1, lineEnd: 1, side: "new", resolved: false,
      pinnedRef: "abc123", outdated: false,
      comments: [{ id: "c1", author: "user", body: "why is this here?", pending: false, createdAt: "2026-01-01T00:00:00Z" }],
    };
    const { container } = render(
      <DiffView
        file={fileWithShift} repoPath="/repo" repoName="repo:main"
        comments={{ ...comments, threads: [thread] }}
      />,
    );
    const newPane = container.querySelector(".diff-pane[data-side='new']") as HTMLElement;
    const targetRow = within(newPane).getByText("target line").closest(".diff-line")!;
    const insertedRow = within(newPane).getByText("inserted").closest(".diff-line")!;
    expect(targetRow.nextElementSibling?.textContent).toContain("why is this here?");
    expect(insertedRow.nextElementSibling?.textContent ?? "").not.toContain("why is this here?");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffView, type CommentHandlers } from "./DiffView";
import type { DiffFile } from "../types";

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
});

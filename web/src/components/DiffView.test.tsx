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

const comments: CommentHandlers = {
  threads: [], selection: null, composerArmed: false, quotedText: null,
  onGutterMouseDown: vi.fn(), onGutterMouseEnter: vi.fn(), onCreateThread: vi.fn(),
  onCancelSelection: vi.fn(), onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
};

describe("DiffView", () => {
  it("shows an uncommitted-changes banner when the active range targets the uncommitted pseudo-commit", () => {
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" activeRangeTo="uncommitted" comments={comments} />,
    );
    expect(screen.getByText(/Viewing uncommitted changes/)).toBeInTheDocument();
  });

  it("shows no banner when a real commit range or no range is active", () => {
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" activeRangeTo="abc123" comments={comments} />,
    );
    expect(screen.queryByText(/Viewing uncommitted changes/)).not.toBeInTheDocument();
  });
});

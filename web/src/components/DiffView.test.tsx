import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

afterEach(() => vi.restoreAllMocks());

describe("DiffView", () => {
  it("opens the raw file view in a new tab at the given ref, instead of toggling in place", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="abc123" comments={comments} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View File" }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(target).toBe("_blank");
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toBe("/view-file");
    expect(parsed.searchParams.get("repoPath")).toBe("/repo");
    expect(parsed.searchParams.get("path")).toBe("a.ts");
    expect(parsed.searchParams.get("ref")).toBe("abc123");
    expect(parsed.searchParams.get("repoName")).toBe("repo:main");
  });

  it("keeps showing the diff panes after clicking View File, since it no longer toggles in place", () => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View File" }));

    expect(container.querySelectorAll(".diff-pane")).toHaveLength(2);
  });
});

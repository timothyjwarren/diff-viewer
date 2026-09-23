import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
  onCancelSelection: vi.fn(), onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onResolve: vi.fn(),
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

  it("shows an uncommitted-changes banner when showUncommittedBanner is true", () => {
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" showUncommittedBanner comments={comments} />,
    );
    expect(screen.getByText(/Viewing uncommitted changes/)).toBeInTheDocument();
  });

  it("shows no banner when showUncommittedBanner is false or omitted", () => {
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" showUncommittedBanner={false} comments={comments} />,
    );
    expect(screen.queryByText(/Viewing uncommitted changes/)).not.toBeInTheDocument();

    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );
    expect(screen.queryByText(/Viewing uncommitted changes/)).not.toBeInTheDocument();
  });

  it("tints only the specific lines flagged uncommitted, not the whole file's other additions", () => {
    render(
      <DiffView file={fileWithMixedAdds} repoPath="/repo" repoName="repo:main" gitRef="working" showUncommittedBanner comments={comments} />,
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
        file={fileWithShift} repoPath="/repo" repoName="repo:main" gitRef="working"
        comments={{ ...comments, threads: [thread] }}
      />,
    );
    const newPane = container.querySelector(".diff-pane[data-side='new']") as HTMLElement;
    const targetRow = within(newPane).getByText("target line").closest(".diff-line")!;
    const insertedRow = within(newPane).getByText("inserted").closest(".diff-line")!;
    expect(targetRow.nextElementSibling?.textContent).toContain("why is this here?");
    expect(insertedRow.nextElementSibling?.textContent ?? "").not.toContain("why is this here?");
  });

  it("scrolls the sticky header into view when collapsing a file", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );

    fireEvent.click(screen.getByLabelText("Collapse file"));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("does not scroll when expanding an already-collapsed file", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );

    fireEvent.click(screen.getByLabelText("Collapse file"));
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByLabelText("Expand file"));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("renders a single full-width pane for a newly added file", () => {
    const addedFile: DiffFile = { ...file, status: "added" };
    const { container } = render(
      <DiffView file={addedFile} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );
    const panes = container.querySelectorAll(".diff-pane");
    expect(panes).toHaveLength(1);
    expect(panes[0].getAttribute("data-side")).toBe("new");
  });

  it("still renders two panes for a modified file", () => {
    const { container } = render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );
    expect(container.querySelectorAll(".diff-pane")).toHaveLength(2);
  });

  it("resizes the two panes by dragging the divider between them", () => {
    const { container } = render(
      <DiffView file={file} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );
    const body = container.querySelector(".diff-view-body") as HTMLElement;
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ width: 200 } as DOMRect);
    const divider = screen.getByRole("separator");

    fireEvent.mouseDown(divider, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    expect(body.style.gridTemplateColumns).toBe("75% 4px 25%");
  });

  it("does not show a divider for a single-pane (new) file", () => {
    const addedFile: DiffFile = { ...file, status: "added" };
    render(
      <DiffView file={addedFile} repoPath="/repo" repoName="repo:main" gitRef="working" comments={comments} />,
    );
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("resets a manually-enlarged composer textarea's height after submitting", () => {
    const selection = { file: "a.ts", side: "new" as const, start: 1, end: 1 };
    render(
      <DiffView
        file={file} repoPath="/repo" repoName="repo:main" gitRef="working"
        comments={{ ...comments, selection, composerArmed: true }}
      />,
    );
    const textarea = screen.getByPlaceholderText("Leave a comment...") as HTMLTextAreaElement;
    textarea.style.height = "200px";

    fireEvent.click(screen.getByText("Add single comment"));

    expect(textarea.style.height).toBe("");
  });

  it("cancels the composer on Escape when its draft is empty", () => {
    const onCancelSelection = vi.fn();
    const selection = { file: "a.ts", side: "new" as const, start: 1, end: 1 };
    render(
      <DiffView
        file={file} repoPath="/repo" repoName="repo:main" gitRef="working"
        comments={{ ...comments, selection, composerArmed: true, onCancelSelection }}
      />,
    );
    const textarea = screen.getByPlaceholderText("Leave a comment...");

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onCancelSelection).toHaveBeenCalledTimes(1);
  });

  it("does not cancel the composer on Escape when its draft has text", () => {
    const onCancelSelection = vi.fn();
    const selection = { file: "a.ts", side: "new" as const, start: 1, end: 1 };
    render(
      <DiffView
        file={file} repoPath="/repo" repoName="repo:main" gitRef="working"
        comments={{ ...comments, selection, composerArmed: true, onCancelSelection }}
      />,
    );
    const textarea = screen.getByPlaceholderText("Leave a comment...");
    fireEvent.change(textarea, { target: { value: "not empty" } });

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onCancelSelection).not.toHaveBeenCalled();
  });

  it("submits the composer as a single comment on Cmd/Ctrl+Enter", () => {
    const onCreateThread = vi.fn();
    const selection = { file: "a.ts", side: "new" as const, start: 1, end: 1 };
    render(
      <DiffView
        file={file} repoPath="/repo" repoName="repo:main" gitRef="working"
        comments={{ ...comments, selection, composerArmed: true, onCreateThread }}
      />,
    );
    const textarea = screen.getByPlaceholderText("Leave a comment...");
    fireEvent.change(textarea, { target: { value: "looks good" } });

    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onCreateThread).toHaveBeenCalledWith("new", 1, 1, "looks good", false);
  });

  it("does not submit the composer on a plain Enter (inserts a newline instead)", () => {
    const onCreateThread = vi.fn();
    const selection = { file: "a.ts", side: "new" as const, start: 1, end: 1 };
    render(
      <DiffView
        file={file} repoPath="/repo" repoName="repo:main" gitRef="working"
        comments={{ ...comments, selection, composerArmed: true, onCreateThread }}
      />,
    );
    const textarea = screen.getByPlaceholderText("Leave a comment...");
    fireEvent.change(textarea, { target: { value: "looks good" } });

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onCreateThread).not.toHaveBeenCalled();
  });
});

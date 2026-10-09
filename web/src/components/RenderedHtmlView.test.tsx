import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RenderedHtmlView } from "./RenderedHtmlView";
import type { CommentHandlers } from "./DiffView";
import type { CommentThread as CommentThreadData, DiffFile } from "../types";
import { fetchRendered } from "../api/client";

vi.mock("../api/client", () => ({ fetchRendered: vi.fn() }));

const modified: DiffFile = {
  repoPath: "/repo", oldPath: "d.html", newPath: "d.html", status: "modified",
  hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [
    { type: "del", oldLineNumber: 1, newLineNumber: null, content: "<p>a</p>" },
    { type: "add", oldLineNumber: null, newLineNumber: 1, content: "<p>b</p>" },
  ] }],
};

function makeComments(): CommentHandlers {
  return {
    threads: [], selection: null, composerArmed: false, quotedText: null,
    onGutterMouseDown: vi.fn(), onGutterMouseEnter: vi.fn(), onCreateThread: vi.fn(),
    onCancelSelection: vi.fn(), onReply: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
    onResolve: vi.fn(), onFlag: vi.fn(), onRead: vi.fn(), navAvailability: {}, onNavigate: vi.fn(),
  };
}

const rect = { top: 20, left: 30, width: 100, height: 20 };

function makeThread(id: string, body: string): CommentThreadData {
  return {
    id, repoPath: "/repo", file: "d.html", lineStart: 1, lineEnd: 1, side: "new", resolved: false,
    pinnedRef: "abc123", outdated: false,
    comments: [{ id: `${id}-c`, author: "user", body, pending: false, createdAt: "2026-01-01T00:00:00Z" }],
  };
}

function send(source: Window | null, data: unknown) {
  fireEvent(window, new MessageEvent("message", { data, source }));
}

function setup(file: DiffFile = modified, comments = makeComments()) {
  render(<RenderedHtmlView file={file} repoPath="/repo" fromRef="abc" toRef="def" hunks={file.hunks} comments={comments} />);
  return comments;
}

beforeEach(() => {
  vi.mocked(fetchRendered).mockReset();
  vi.mocked(fetchRendered).mockImplementation(async p => `<html><body>${p.side}</body></html>`);
});

describe("RenderedHtmlView", () => {
  it("renders old and new previews in iframes sandboxed with allow-scripts only", async () => {
    setup();
    const oldFrame = await screen.findByTitle("old rendered");
    const newFrame = await screen.findByTitle("new rendered");
    for (const frame of [oldFrame, newFrame]) {
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    }
    await waitFor(() => expect(oldFrame.getAttribute("srcdoc")).toContain("old"));
    expect(fetchRendered).toHaveBeenCalledWith({ repoPath: "/repo", path: "d.html", side: "old", from: "abc", to: "def", scripts: false });
  });

  it("fetches only the new side for an added file and only the old side for a deleted one", async () => {
    setup({ ...modified, status: "added" });
    await screen.findByTitle("new rendered");
    expect(screen.queryByTitle("old rendered")).toBeNull();
    expect(vi.mocked(fetchRendered).mock.calls.map(c => c[0].side)).toEqual(["new"]);
  });

  it("refetches with scripts on when 'Run scripts' is toggled, and starts off", async () => {
    setup();
    await screen.findByTitle("new rendered");
    const toggle = screen.getByLabelText("Run scripts") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => expect(fetchRendered).toHaveBeenCalledWith(expect.objectContaining({ side: "new", scripts: true })));
  });

  it("opens a composer at the clicked source line and creates the thread on that side", async () => {
    const comments = setup();
    const frame = await screen.findByTitle("new rendered") as HTMLIFrameElement;
    fireEvent(window, new MessageEvent("message", { data: { type: "dv-click", line: 4, rect }, source: frame.contentWindow }));
    fireEvent.change(await screen.findByPlaceholderText("Leave a comment..."), { target: { value: "hello" } });
    fireEvent.click(screen.getByText("Add single comment"));
    expect(comments.onCreateThread).toHaveBeenCalledWith("new", 4, 4, "hello", false);
  });

  it("names the commenting target and starts a fresh composer when another element is clicked", async () => {
    const comments = setup();
    const frame = await screen.findByTitle("new rendered") as HTMLIFrameElement;
    const click = (line: number) =>
      fireEvent(window, new MessageEvent("message", { data: { type: "dv-click", line, rect }, source: frame.contentWindow }));
    click(4);
    expect(await screen.findByText("Commenting on new line 4")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Leave a comment..."), { target: { value: "draft" } });
    click(6);
    expect(await screen.findByText("Commenting on new line 6")).toBeTruthy();
    expect((screen.getByPlaceholderText("Leave a comment...") as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(screen.getByPlaceholderText("Leave a comment..."), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Add single comment"));
    expect(comments.onCreateThread).toHaveBeenCalledWith("new", 6, 6, "x", false);
  });

  it("opens the composer in a bubble just below the clicked element, not in a strip under the previews", async () => {
    setup();
    const frame = await screen.findByTitle("new rendered") as HTMLIFrameElement;
    send(frame.contentWindow, { type: "dv-click", line: 4, rect });
    const bubble = await screen.findByRole("dialog");
    expect(bubble.style.top).toBe("48px");
    expect(bubble.style.getPropertyValue("--bubble-left")).toBe("30px");
    expect(bubble.contains(screen.getByPlaceholderText("Leave a comment..."))).toBe(true);
    expect(bubble.closest(".rendered-view-pane")).toBe(frame.closest(".rendered-view-pane"));
  });

  it("closes the bubble on Escape and with its close button", async () => {
    setup();
    const frame = await screen.findByTitle("new rendered") as HTMLIFrameElement;
    send(frame.contentWindow, { type: "dv-click", line: 4, rect });
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    send(frame.contentWindow, { type: "dv-click", line: 4, rect });
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a thread in a bubble when its marker is clicked", async () => {
    const comments = makeComments();
    comments.threads = [makeThread("t1", "why this wording?"), makeThread("t2", "other thread")];
    setup(modified, comments);
    const frame = await screen.findByTitle("new rendered") as HTMLIFrameElement;
    expect(screen.queryByText("why this wording?")).toBeNull();
    send(frame.contentWindow, { type: "dv-marker-click", threadId: "t1", rect });
    const bubble = await screen.findByRole("dialog");
    expect(bubble.textContent).toContain("why this wording?");
    expect(bubble.textContent).not.toContain("other thread");
  });

  it("sizes each preview to the page height its bridge reports", async () => {
    setup();
    const frame = await screen.findByTitle("new rendered") as HTMLIFrameElement;
    send(frame.contentWindow, { type: "dv-height", height: 640 });
    await waitFor(() => expect(frame.style.height).toBe("640px"));
    expect((screen.getByTitle("old rendered") as HTMLIFrameElement).style.height).not.toBe("640px");
  });

  it("ignores messages that do not come from its own iframes", async () => {
    setup();
    await screen.findByTitle("new rendered");
    fireEvent(window, new MessageEvent("message", { data: { type: "dv-click", line: 4, rect }, source: window }));
    expect(screen.queryByPlaceholderText("Leave a comment...")).toBeNull();
  });

  it("shows an error message when a preview cannot be loaded", async () => {
    vi.mocked(fetchRendered).mockRejectedValue(new Error("nope"));
    setup();
    expect(await screen.findAllByText(/Could not load preview/)).not.toHaveLength(0);
  });
});

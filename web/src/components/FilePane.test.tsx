import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FilePane } from "./FilePane";
import { fetchFileForView, createThread } from "../api/client";
import type { CommentThread } from "../types";

vi.mock("../api/client", () => ({
  fetchFileForView: vi.fn(),
  createThread: vi.fn(),
  addReply: vi.fn(), editComment: vi.fn(), deleteComment: vi.fn(),
  resolveThread: vi.fn(), flagThread: vi.fn(), markCommentRead: vi.fn(),
}));
vi.mock("shiki", () => ({
  codeToHtml: vi.fn(async (content: string) => `<pre><code>${content}</code></pre>`),
}));

const HEAD = "head111";

function session(threads: CommentThread[] = [], dirtyFiles: string[] = []) {
  return { threads, headSha: HEAD, dirtyFiles, refresh: vi.fn(async () => {}) };
}

function liveThread(over: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "t1", repoPath: "/r", file: "a.ts", lineStart: 2, lineEnd: 2, side: "new", resolved: false,
    pinnedRef: HEAD, outdated: false,
    comments: [{ id: "c1", author: "user", body: "a question", pending: false, createdAt: "2026-01-01T00:00:00Z" }],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(fetchFileForView).mockReset();
  vi.mocked(createThread).mockReset();
});

describe("FilePane", () => {
  it("posts a comment on the clicked line with side new and the page ref", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: ["one", "two", "three"] });
    vi.mocked(createThread).mockResolvedValue({} as CommentThread);
    const s = session();
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="a.ts" session={s} />);
    await waitFor(() => expect(screen.getByText("two")).toBeInTheDocument());

    fireEvent.click(screen.getByText("2"));
    fireEvent.change(screen.getByPlaceholderText("Leave a comment..."), { target: { value: "why?" } });
    fireEvent.click(screen.getByText("Add single comment"));

    await waitFor(() => expect(createThread).toHaveBeenCalled());
    expect(vi.mocked(createThread).mock.calls[0]).toEqual([
      expect.objectContaining({ repoPath: "/r", file: "a.ts", lineStart: 2, lineEnd: 2, side: "new", body: "why?", pending: false }),
      HEAD,
    ]);
    await waitFor(() => expect(s.refresh).toHaveBeenCalled());
  });

  it("extends the selection to a range on shift-click", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: ["one", "two", "three"] });
    vi.mocked(createThread).mockResolvedValue({} as CommentThread);
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="a.ts" session={session()} />);
    await waitFor(() => expect(screen.getByText("three")).toBeInTheDocument());
    fireEvent.click(screen.getByText("2"));
    fireEvent.click(screen.getByText("3"), { shiftKey: true });
    fireEvent.change(screen.getByPlaceholderText("Leave a comment..."), { target: { value: "range" } });
    fireEvent.click(screen.getByText("Add single comment"));
    await waitFor(() => expect(createThread).toHaveBeenCalled());
    expect(vi.mocked(createThread).mock.calls[0][0]).toMatchObject({ lineStart: 2, lineEnd: 3 });
  });

  it("shows live threads inline at the HEAD ref", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: ["one", "two"] });
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="a.ts" session={session([liveThread()])} />);
    await waitFor(() => expect(screen.getByText("a question")).toBeInTheDocument());
    expect(screen.queryByText(/anchored to a newer version/)).toBeNull();
  });

  it("at an older ref hides threads and shows a banner linking to HEAD", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: ["one", "two"] });
    render(<FilePane repoPath="/r" gitRef="older222" filePath="a.ts" session={session([liveThread()])} />);
    const banner = await screen.findByText(/1 threads? on this file (is|are) anchored to a newer version/);
    expect(screen.queryByText("a question")).toBeNull();
    expect(banner.closest("div")!.querySelector("a")!.getAttribute("href")).toContain(`ref=${HEAD}`);
  });

  it("shows a placeholder for a binary file", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: [], skipped: "binary" });
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="a.bin" session={session()} />);
    expect(await screen.findByText("Binary file")).toBeInTheDocument();
  });

  it("shows a placeholder for a too-large file", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: [], skipped: "too-large" });
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="big.txt" session={session()} />);
    expect(await screen.findByText("File too large to display")).toBeInTheDocument();
  });

  it("shows a not-found state on a 404", async () => {
    vi.mocked(fetchFileForView).mockRejectedValue(new Error("404 Not Found"));
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="gone.ts" session={session()} />);
    expect(await screen.findByText("File not found at this ref")).toBeInTheDocument();
  });

  it("renders an empty file without error", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: [""] });
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="empty.txt" session={session()} />);
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("highlights the requested line", async () => {
    vi.mocked(fetchFileForView).mockResolvedValue({ lines: ["one", "two"] });
    render(<FilePane repoPath="/r" gitRef={HEAD} filePath="a.ts" line={2} session={session()} />);
    await waitFor(() => expect(screen.getByText("two")).toBeInTheDocument());
    expect(screen.getByText("two").closest(".file-view-line")).toHaveClass("file-view-line-target");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrowserPage } from "./BrowserPage";
import { fetchTree, fetchFileForView } from "../api/client";

vi.mock("../api/client", () => ({
  fetchTree: vi.fn(), fetchFileForView: vi.fn(),
  fetchThreads: vi.fn(async () => []),
  fetchRepoState: vi.fn(async () => ({ headSha: "abc1234", dirty: false, dirtyFiles: [] })),
  createThread: vi.fn(), addReply: vi.fn(), editComment: vi.fn(), deleteComment: vi.fn(),
  resolveThread: vi.fn(), flagThread: vi.fn(), markCommentRead: vi.fn(),
}));
vi.mock("shiki", () => ({
  codeToHtml: vi.fn(async (content: string) => `<pre><code>${content}</code></pre>`),
}));

const listings: Record<string, { name: string; type: "file" | "dir"; changed: boolean }[]> = {
  "": [{ name: "src", type: "dir", changed: false }],
  src: [{ name: "util.ts", type: "file", changed: false }, { name: "main.ts", type: "file", changed: false }],
};

beforeEach(() => {
  vi.mocked(fetchTree).mockReset();
  vi.mocked(fetchTree).mockImplementation(async (_r, _ref, p) => {
    if (!(p in listings)) throw new Error("404 Not Found");
    return { repoName: "repo:main", entries: listings[p] };
  });
  vi.mocked(fetchFileForView).mockReset();
  vi.mocked(fetchFileForView).mockResolvedValue({ lines: ["hello"] });
});

describe("BrowserPage", () => {
  it("shows the repo name, path and ref in the header", async () => {
    render(<BrowserPage repoPath="/r" ref="abc1234def" path="src" />);
    expect(await screen.findByText("repo:main")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("shows a select-a-file state for a directory path and opens a clicked file via pushState", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(<BrowserPage repoPath="/r" ref="abc1234def" path="src" />);
    expect(await screen.findByText("Select a file")).toBeInTheDocument();
    fireEvent.click(await screen.findByText("util.ts"));
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    const url = String(push.mock.calls[0][2]);
    const params = new URL(url, "http://x").searchParams;
    expect(params.get("path")).toBe("src/util.ts");
    expect(params.get("ref")).toBe("abc1234def");
    expect(params.has("line")).toBe(false);
    expect(screen.queryByText("Select a file")).toBeNull();
    push.mockRestore();
  });

  it("opens a file path directly in the pane", async () => {
    render(<BrowserPage repoPath="/r" ref="abc1234def" path="src/util.ts" line={1} />);
    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());
    expect(fetchFileForView).toHaveBeenCalledWith("/r", "src/util.ts", "abc1234def");
  });

  it("shows a not-found state when the path is missing", async () => {
    render(<BrowserPage repoPath="/r" ref="abc1234def" path="nope/x.ts" />);
    expect(await screen.findByText("Path not found at this ref")).toBeInTheDocument();
    expect(fetchFileForView).not.toHaveBeenCalled();
  });

  it("shows a not-found state when a file name is absent from its parent listing", async () => {
    render(<BrowserPage repoPath="/r" ref="abc1234def" path="src/missing.ts" />);
    expect(await screen.findByText("Path not found at this ref")).toBeInTheDocument();
  });
});

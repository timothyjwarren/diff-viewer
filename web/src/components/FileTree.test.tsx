import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FileTree } from "./FileTree";
import { fetchTree } from "../api/client";

vi.mock("../api/client", () => ({ fetchTree: vi.fn() }));

const listings: Record<string, { name: string; type: "file" | "dir"; changed: boolean }[]> = {
  "": [{ name: "foo", type: "dir", changed: true }, { name: "top.ts", type: "file", changed: false }],
  foo: [{ name: "bar", type: "dir", changed: true }, { name: "other", type: "dir", changed: false }],
  "foo/bar": [{ name: "baz", type: "dir", changed: true }],
  "foo/bar/baz": [
    { name: "qux.json", type: "file", changed: true },
    { name: "util.ts", type: "file", changed: false },
  ],
  "foo/other": [{ name: "deep.ts", type: "file", changed: false }],
};

beforeEach(() => {
  vi.mocked(fetchTree).mockReset();
  vi.mocked(fetchTree).mockImplementation(async (_repo, _ref, p) => {
    if (!(p in listings)) throw new Error("404 Not Found");
    return { repoName: "repo:main", entries: listings[p] };
  });
});

describe("FileTree", () => {
  it("auto-expands every ancestor of the selected file and marks changed entries", async () => {
    render(<FileTree repoPath="/r" gitRef="abc" selectedPath="foo/bar/baz/util.ts" onSelectFile={() => {}} />);
    await waitFor(() => expect(screen.getByText("util.ts")).toBeInTheDocument());
    expect(screen.getByText("qux.json")).toBeInTheDocument();
    expect(fetchTree).toHaveBeenCalledWith("/r", "abc", "foo/bar/baz");
    // "other" is collapsed: its children were never requested.
    expect(fetchTree).not.toHaveBeenCalledWith("/r", "abc", "foo/other");
    const row = screen.getByText("qux.json").closest("[role=treeitem]")!;
    expect(row).toHaveTextContent("diff");
    expect(screen.getByText("util.ts").closest("[role=treeitem]")).not.toHaveTextContent("diff");
  });

  it("expands a selected directory itself", async () => {
    render(<FileTree repoPath="/r" gitRef="abc" selectedPath="foo/bar/baz" onSelectFile={() => {}} />);
    await waitFor(() => expect(screen.getByText("qux.json")).toBeInTheDocument());
  });

  it("loads a directory when clicked and reports a clicked file", async () => {
    const onSelectFile = vi.fn();
    render(<FileTree repoPath="/r" gitRef="abc" selectedPath="" onSelectFile={onSelectFile} />);
    await waitFor(() => expect(screen.getByText("foo")).toBeInTheDocument());
    fireEvent.click(screen.getByText("foo"));
    await waitFor(() => expect(screen.getByText("other")).toBeInTheDocument());
    fireEvent.click(screen.getByText("top.ts"));
    expect(onSelectFile).toHaveBeenCalledWith("top.ts");
  });
});

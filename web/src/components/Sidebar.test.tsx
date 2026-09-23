import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { fileAnchorId } from "../lib/fileAnchor";
import type { RepoDiff } from "../types";

const repos: RepoDiff[] = [
  {
    repo: "repoA", branch: "main", repoPath: "/r/a",
    files: [{ repoPath: "/r/a", oldPath: "x.ts", newPath: "x.ts", status: "modified", hunks: [] }],
  },
  {
    repo: "repoB", branch: "feature", repoPath: "/r/b",
    files: [{ repoPath: "/r/b", oldPath: "y.ts", newPath: "y.ts", status: "added", hunks: [] }],
  },
];

describe("Sidebar", () => {
  it("lists each repo and its changed files", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} />);
    expect(screen.getByText("repoA:main")).toBeInTheDocument();
    expect(screen.getByText("repoB:feature")).toBeInTheDocument();
    expect(screen.getByText("x.ts")).toBeInTheDocument();
    expect(screen.getByText("y.ts")).toBeInTheDocument();
  });

  it("calls onSelectFile with the repo path and file when clicked", () => {
    const onSelectFile = vi.fn();
    render(<Sidebar repos={repos} onSelectFile={onSelectFile} />);
    fireEvent.click(screen.getByText("x.ts"));
    expect(onSelectFile).toHaveBeenCalledWith(repos[0].files[0]);
  });

  it("shows a viewport indicator only while files are on screen", () => {
    const { rerender } = render(<Sidebar repos={repos} onSelectFile={() => {}} />);
    expect(screen.queryByTestId("viewport-indicator")).not.toBeInTheDocument();
    const span = { startId: fileAnchorId(repos[0].files[0]), startFraction: 0.5, endId: fileAnchorId(repos[1].files[0]), endFraction: 0.5 };
    rerender(<Sidebar repos={repos} onSelectFile={() => {}} viewportSpan={span} />);
    expect(screen.getByTestId("viewport-indicator")).toBeInTheDocument();
  });

  it("shows the session title", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} title="my review" />);
    expect(screen.getByRole("heading", { name: "my review" })).toBeInTheDocument();
  });

  it("keeps the full path in the row's hover title", () => {
    const nested: RepoDiff[] = [{
      ...repos[0],
      files: [{ ...repos[0].files[0], oldPath: "a/b/c/d.ts", newPath: "a/b/c/d.ts" }],
    }];
    render(<Sidebar repos={nested} onSelectFile={() => {}} />);
    expect(screen.getByText("d.ts").closest("li")).toHaveAttribute("title", "a/b/c/d.ts");
  });
});

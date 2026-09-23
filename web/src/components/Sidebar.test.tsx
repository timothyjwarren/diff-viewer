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

  it("highlights the row for the currently active file", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} activeFileId={fileAnchorId(repos[0].files[0])} />);
    expect(screen.getByText("x.ts").closest("li")).toHaveClass("sidebar-file-active");
    expect(screen.getByText("y.ts").closest("li")).not.toHaveClass("sidebar-file-active");
  });
});

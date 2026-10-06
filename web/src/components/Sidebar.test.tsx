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
    const span = { startId: fileAnchorId(repos[0].files[0]), endId: fileAnchorId(repos[1].files[0]) };
    rerender(<Sidebar repos={repos} onSelectFile={() => {}} viewportSpan={span} />);
    expect(screen.getByTestId("viewport-indicator")).toBeInTheDocument();
  });

  it("shows the session title", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} title="my review" />);
    expect(screen.getByRole("heading", { name: "my review" })).toBeInTheDocument();
  });

  it("shows a plain title, with no toggle, when there is no description", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} title="my review" />);
    expect(screen.queryByRole("button", { name: "my review" })).not.toBeInTheDocument();
  });

  it("expands the description from the title, starting collapsed", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} title="my review" description="Reviewing **auth**." />);
    const toggle = screen.getByRole("button", { name: "my review" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("auth")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("auth").tagName).toBe("STRONG");
  });

  it("remembers whether each session's description is open", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    });
    const { unmount } = render(
      <Sidebar repos={repos} onSelectFile={() => {}} title="t" description="d" sessionId="s1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "t" }));
    unmount();

    const { unmount: unmountAgain } = render(
      <Sidebar repos={repos} onSelectFile={() => {}} title="t" description="d" sessionId="s1" />,
    );
    expect(screen.getByRole("button", { name: "t" })).toHaveAttribute("aria-expanded", "true");
    unmountAgain();

    render(<Sidebar repos={repos} onSelectFile={() => {}} title="t" description="d" sessionId="s2" />);
    expect(screen.getByRole("button", { name: "t" })).toHaveAttribute("aria-expanded", "false");
    vi.unstubAllGlobals();
  });

  it("summarises the number of changed files", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} />);
    expect(screen.getByText(/2 files/)).toBeInTheDocument();
  });

  it("counts open threads on each file, ignoring resolved ones", () => {
    const thread = {
      id: "t1", repoPath: "/r/a", file: "x.ts", lineStart: 1, lineEnd: 1, side: "new" as const,
      resolved: false, pinnedRef: "HEAD", outdated: false, comments: [],
    };
    render(<Sidebar repos={repos} onSelectFile={() => {}} threads={[thread, { ...thread, id: "t2" }, { ...thread, id: "t3", resolved: true }]} />);
    expect(screen.getByLabelText("2 open threads")).toHaveTextContent("2");
    expect(screen.getAllByLabelText(/open thread/)).toHaveLength(1);
  });

  it("keeps the full path in the row's hover title", () => {
    const nested: RepoDiff[] = [{
      ...repos[0],
      files: [{ ...repos[0].files[0], oldPath: "a/b/c/d.ts", newPath: "a/b/c/d.ts" }],
    }];
    render(<Sidebar repos={nested} onSelectFile={() => {}} />);
    expect(screen.getByText("d.ts").closest("li")).toHaveAttribute("title", "a/b/c/d.ts");
  });

  it("shows the reviewed tally and a checkmark only on reviewed files", () => {
    render(
      <Sidebar
        repos={repos} onSelectFile={() => {}} reviewedCount={1}
        isReviewed={file => file === repos[0].files[0]}
      />,
    );
    expect(screen.getByText("1 / 2 reviewed")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Reviewed" })).toHaveLength(1);
    expect(screen.getByText("x.ts").closest("li")).toContainElement(screen.getByRole("img", { name: "Reviewed" }));
  });

  it("offers to expand or collapse reviewed files only when there are some", () => {
    const onToggleAllReviewed = vi.fn();
    const { rerender } = render(<Sidebar repos={repos} onSelectFile={() => {}} />);
    expect(screen.queryByRole("button", { name: /reviewed/i })).not.toBeInTheDocument();

    rerender(
      <Sidebar repos={repos} onSelectFile={() => {}} reviewedCount={1} anyReviewedCollapsed onToggleAllReviewed={onToggleAllReviewed} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand reviewed" }));
    expect(onToggleAllReviewed).toHaveBeenCalledTimes(1);

    rerender(<Sidebar repos={repos} onSelectFile={() => {}} reviewedCount={1} />);
    expect(screen.getByRole("button", { name: "Collapse reviewed" })).toBeInTheDocument();
  });

  it("still shows open-thread counts on a reviewed file", () => {
    const thread = {
      id: "t", repoPath: "/r/a", file: "x.ts", lineStart: 1, lineEnd: 1, side: "new" as const,
      resolved: false, pinnedRef: "working", outdated: false, comments: [],
    };
    render(
      <Sidebar repos={repos} onSelectFile={() => {}} threads={[thread]} reviewedCount={1} isReviewed={() => true} />,
    );
    expect(screen.getByLabelText("1 open thread")).toBeInTheDocument();
  });

  it("warns loudly when no agent is listening, shows a quiet status when one is, and nothing when unknown", () => {
    const { rerender } = render(<Sidebar repos={repos} onSelectFile={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<Sidebar repos={repos} onSelectFile={() => {}} agentListening />);
    expect(screen.getByRole("status")).toHaveTextContent("Agent listening");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<Sidebar repos={repos} onSelectFile={() => {}} agentListening={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No agent listening");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

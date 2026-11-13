import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { fileAnchorId } from "../lib/fileAnchor";
import type { CommentThread, RepoDiff } from "../types";

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

function otherThread(over: Partial<CommentThread>): CommentThread {
  return {
    id: "t", repoPath: "/r/a", file: "lib/util.ts", lineStart: 12, lineEnd: 12, side: "new",
    resolved: false, pinnedRef: "abc", outdated: false, comments: [], ...over,
  };
}

describe("Sidebar other files", () => {
  const props = { headShaByRepo: { "/r/a": "head999" } };

  it("lists an open thread on a file outside the diff, linking to the browser at HEAD and its line", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}} threads={[otherThread({})]} {...props} />);
    expect(screen.getByText("Other files")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /lib\/util\.ts:12/ });
    const params = new URL(link.getAttribute("href")!, "http://x").searchParams;
    expect(params.get("repoPath")).toBe("/r/a");
    expect(params.get("path")).toBe("lib/util.ts");
    expect(params.get("line")).toBe("12");
    expect(params.get("ref")).toBe("head999");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("links at uncommitted for an uncommitted-pinned thread and at HEAD for a sha-pinned one", () => {
    render(<Sidebar repos={repos} onSelectFile={() => {}}
      threads={[otherThread({ id: "u", pinnedRef: "uncommitted", lineStart: 5 }), otherThread({ id: "s", lineStart: 9 })]}
      {...props} />);
    const ref = (re: RegExp) =>
      new URL(screen.getByRole("link", { name: re }).getAttribute("href")!, "http://x").searchParams.get("ref");
    expect(ref(/lib\/util\.ts:5/)).toBe("uncommitted");
    expect(ref(/lib\/util\.ts:9/)).toBe("head999");
  });

  it("omits the section for threads on diff files, resolved threads, and when empty", () => {
    const { rerender } = render(<Sidebar repos={repos} onSelectFile={() => {}} threads={[otherThread({ file: "x.ts" })]} {...props} />);
    expect(screen.queryByText("Other files")).toBeNull();
    rerender(<Sidebar repos={repos} onSelectFile={() => {}} threads={[otherThread({ resolved: true })]} {...props} />);
    expect(screen.queryByText("Other files")).toBeNull();
    rerender(<Sidebar repos={repos} onSelectFile={() => {}} {...props} />);
    expect(screen.queryByText("Other files")).toBeNull();
  });
});

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

  it("repositions the viewport indicator when the layout above the file rows changes", () => {
    let rowTop = 100;
    const callbacks: Array<(entries: unknown[]) => void> = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: (entries: unknown[]) => void) { callbacks.push(cb); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.hasAttribute("data-file-id") ? rowTop : 0;
      return { top, bottom: top + 26, height: 26, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} } as DOMRect;
    });
    try {
      const id = fileAnchorId(repos[0].files[0]);
      render(<Sidebar repos={repos} onSelectFile={() => {}} viewportSpan={{ startId: id, endId: id }} />);
      const indicator = screen.getByTestId("viewport-indicator");
      expect(indicator.style.top).toBe("100px");
      rowTop = 40;
      act(() => callbacks.forEach(cb => cb([{ contentRect: { width: 100 } }])));
      expect(indicator.style.top).toBe("40px");
    } finally {
      rectSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("scrolls the sidebar to keep the rows of the files on screen in sight", () => {
    const rowTops: Record<string, number> = { [fileAnchorId(repos[0].files[0])]: 100, [fileAnchorId(repos[1].files[0])]: 900 };
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const nav = this.closest("nav");
      const id = this.getAttribute("data-file-id");
      const top = id ? rowTops[id] - (nav?.scrollTop ?? 0) : 0;
      return { top, bottom: top + 26, height: 26, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} } as DOMRect;
    });
    const heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    try {
      const a = fileAnchorId(repos[0].files[0]);
      const b = fileAnchorId(repos[1].files[0]);
      const { container, rerender } = render(<Sidebar repos={repos} onSelectFile={() => {}} viewportSpan={{ startId: a, endId: a }} />);
      const nav = container.querySelector("nav")!;
      expect(nav.scrollTop).toBe(0);

      rerender(<Sidebar repos={repos} onSelectFile={() => {}} viewportSpan={{ startId: b, endId: b }} />);
      expect(nav.scrollTop).toBe(900 + 26 - 400 + 32);

      // Scrolling the sidebar by hand sticks while the same files stay on screen.
      nav.scrollTop = 0;
      rerender(<Sidebar repos={repos} onSelectFile={() => {}} viewportSpan={{ startId: b, endId: b }} />);
      expect(nav.scrollTop).toBe(0);
    } finally {
      rectSpy.mockRestore();
      heightSpy.mockRestore();
    }
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

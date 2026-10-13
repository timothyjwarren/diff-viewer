import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CommitChooser } from "./CommitChooser";
import type { CommitInfo } from "../types";

const commits: CommitInfo[] = [
  { sha: "aaa111", shortSha: "aaa111", subject: "first", author: "tj", date: "2026-01-01T00:00:00Z" },
  { sha: "bbb222", shortSha: "bbb222", subject: "second", author: "tj", date: "2026-01-02T00:00:00Z" },
  { sha: "ccc333", shortSha: "ccc333", subject: "third", author: "tj", date: "2026-01-03T00:00:00Z" },
];

describe("CommitChooser", () => {
  it("renders nothing when there are no commits ahead of baseRef", () => {
    const { container } = render(<CommitChooser commits={[]} range={null} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the default 'all commits' label when no range is selected", () => {
    render(<CommitChooser commits={commits} range={null} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /commit range/i })).toHaveTextContent("all 3 commits");
  });

  it("shows a narrowed count label when a range is selected", () => {
    render(<CommitChooser commits={commits} range={{ from: "aaa111", to: "bbb222" }} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /commit range/i })).toHaveTextContent("2 of 3");
  });

  it("opens a popover listing every commit plus a 'Show all commits' reset row", () => {
    render(<CommitChooser commits={commits} range={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    expect(screen.getByText("Show all commits")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.getByText("third")).toBeInTheDocument();
  });

  it("a plain click (mousedown+mouseup, no drag) selects just that commit and closes the popover", () => {
    const onChange = vi.fn();
    render(<CommitChooser commits={commits} range={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.mouseDown(screen.getByText("second"));
    fireEvent.mouseUp(window);
    expect(onChange).toHaveBeenCalledWith({ from: "bbb222", to: "bbb222" });
    expect(screen.queryByText("Show all commits")).not.toBeInTheDocument();
  });

  it("dragging from one commit to another selects the contiguous range between them, without closing the popover mid-drag", () => {
    const onChange = vi.fn();
    render(<CommitChooser commits={commits} range={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.mouseDown(screen.getByText("first"));
    fireEvent.mouseEnter(screen.getByText("second"));
    // Still mid-drag: the popover must stay open, both rows passed over so
    // far must preview as selected, and onChange must not have committed
    // yet (it only fires once, at mouseup).
    expect(screen.getByText("Show all commits")).toBeInTheDocument();
    expect(screen.getByText("first").closest("[role='option']")).toHaveClass("commit-chooser-row-selected");
    expect(screen.getByText("second").closest("[role='option']")).toHaveClass("commit-chooser-row-selected");
    expect(screen.getByText("third").closest("[role='option']")).not.toHaveClass("commit-chooser-row-selected");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.mouseEnter(screen.getByText("third"));
    fireEvent.mouseUp(window);
    expect(onChange).toHaveBeenCalledWith({ from: "aaa111", to: "ccc333" });
  });

  it("dragging in reverse (later commit to earlier) still selects the contiguous range in order", () => {
    const onChange = vi.fn();
    render(<CommitChooser commits={commits} range={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.mouseDown(screen.getByText("third"));
    fireEvent.mouseEnter(screen.getByText("first"));
    fireEvent.mouseUp(window);
    expect(onChange).toHaveBeenCalledWith({ from: "aaa111", to: "ccc333" });
  });

  it("calls onOpen when the popover is opened, but not when it's closed", () => {
    const onOpen = vi.fn();
    render(<CommitChooser commits={commits} range={null} onChange={() => {}} onOpen={onOpen} />);
    const trigger = screen.getByRole("button", { name: /commit range/i });
    fireEvent.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("clicking 'Show all commits' resets the range to null", () => {
    const onChange = vi.fn();
    render(<CommitChooser commits={commits} range={{ from: "aaa111", to: "bbb222" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.click(screen.getByText("Show all commits"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders the uncommitted-changes row distinctly and excludes it from the default label", () => {
    const withUncommitted = [...commits, { sha: "uncommitted", shortSha: "uncommitted", subject: "Uncommitted changes", author: "", date: "" }];
    render(<CommitChooser commits={withUncommitted} range={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /commit range/i })).toHaveTextContent("all 3 commits");
    fireEvent.click(screen.getByRole("button", { name: /commit range/ }));
    expect(screen.getByText("Uncommitted changes").closest("[role='option']")).toHaveClass("commit-chooser-row-uncommitted");
  });

  it("shows an exclusion badge in the default view when there are uncommitted changes, since they're always hidden there", () => {
    const withUncommitted = [...commits, { sha: "uncommitted", shortSha: "uncommitted", subject: "Uncommitted changes", author: "", date: "" }];
    render(<CommitChooser commits={withUncommitted} range={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/commits not shown/)).toBeInTheDocument();
  });

  it("offers a distinct 'Show all commits + uncommitted changes' option when the repo is dirty, with no exclusion badge once selected", () => {
    const withUncommitted = [...commits, { sha: "uncommitted", shortSha: "uncommitted", subject: "Uncommitted changes", author: "", date: "" }];
    const onChange = vi.fn();
    const { rerender } = render(<CommitChooser commits={withUncommitted} range={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.click(screen.getByText("Show all commits + uncommitted changes"));
    expect(onChange).toHaveBeenCalledWith({ from: "", to: "uncommitted" });

    rerender(<CommitChooser commits={withUncommitted} range={{ from: "", to: "uncommitted" }} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /commit range/i })).toHaveTextContent("all 3 + uncommitted");
    expect(screen.queryByLabelText(/commits not shown/)).not.toBeInTheDocument();
  });

  it("does not offer the '+ uncommitted' option when the repo is clean", () => {
    render(<CommitChooser commits={commits} range={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    expect(screen.queryByText(/uncommitted changes/i)).not.toBeInTheDocument();
  });

  it("shows no exclusion badge in the default view when the repo is clean", () => {
    render(<CommitChooser commits={commits} range={null} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/commits not shown/)).not.toBeInTheDocument();
  });

  it("shows a badge on the collapsed trigger when newer commits are excluded from the current range", () => {
    const range = { from: commits[0].sha, to: commits[0].sha }; // narrowed to the oldest commit only
    render(<CommitChooser commits={commits} range={range} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/commits not shown/)).toBeInTheDocument();
  });

  it("shows no exclusion badge when the range already covers every commit", () => {
    render(<CommitChooser commits={commits} range={null} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/commits not shown/)).not.toBeInTheDocument();
  });

  describe("dates", () => {
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
    const now = new Date(2026, 9, 13, 15);
    const dated: CommitInfo[] = [
      { sha: "aaa111", shortSha: "aaa111", subject: "first", author: "tj", date: at(9, 10) },
      { sha: "bbb222", shortSha: "bbb222", subject: "second", author: "tj", date: at(12, 9) },
      { sha: "ccc333", shortSha: "ccc333", subject: "third", author: "tj", date: at(12, 17) },
      { sha: "ddd444", shortSha: "ddd444", subject: "fourth", author: "tj", date: at(13, 12) },
    ];
    const uncommitted: CommitInfo = {
      sha: "uncommitted", shortSha: "uncommitted", subject: "Uncommitted changes", author: "", date: "",
    };
    function open(list: CommitInfo[]) {
      render(<CommitChooser commits={list} range={null} onChange={vi.fn()} now={now} />);
      fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    }

    it("shows each commit's age, with the full date and time as a tooltip", () => {
      open(dated);
      const row = screen.getByText("fourth").closest("[role=option]") as HTMLElement;
      expect(within(row).getByText("3h ago")).toHaveAttribute("title", expect.stringMatching(/October 13, 2026/));
      expect(screen.getByText("4d ago")).toBeInTheDocument();
    });

    it("heads each new day once, naming today and yesterday", () => {
      open(dated);
      expect(screen.getAllByRole("presentation").map(h => h.textContent)).toEqual(["Fri, Oct 9", "Yesterday", "Today"]);
    });

    it("gives the uncommitted row no date and no day heading", () => {
      open([...dated, uncommitted]);
      const row = screen.getByText("Uncommitted changes").closest("[role=option]") as HTMLElement;
      expect(row.querySelector(".commit-chooser-date")).toBeNull();
      expect(screen.getAllByRole("presentation")).toHaveLength(3);
    });

    it("tags only the newest real commit as latest", () => {
      open([...dated, uncommitted]);
      const tags = screen.getAllByText("latest");
      expect(tags).toHaveLength(1);
      expect(tags[0].closest("[role=option]")).toHaveTextContent("fourth");
    });
  });
});

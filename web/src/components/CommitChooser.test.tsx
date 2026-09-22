import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("a plain click on a commit selects just that commit and closes the popover", () => {
    const onChange = vi.fn();
    render(<CommitChooser commits={commits} range={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.click(screen.getByText("second"));
    expect(onChange).toHaveBeenCalledWith({ from: "bbb222", to: "bbb222" });
    expect(screen.queryByText("Show all commits")).not.toBeInTheDocument();
  });

  it("shift-clicking a second commit selects the contiguous range between them", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CommitChooser commits={commits} range={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.click(screen.getByText("first"));
    rerender(<CommitChooser commits={commits} range={{ from: "aaa111", to: "aaa111" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /commit range/i }));
    fireEvent.click(screen.getByText("third"), { shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ from: "aaa111", to: "ccc333" });
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
    fireEvent.click(screen.getByRole("button", { name: /commit range/ }));
    expect(screen.getByText("Uncommitted changes").closest("button")).toHaveClass("commit-chooser-row-uncommitted");
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
});

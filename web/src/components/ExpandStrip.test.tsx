import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpandStrip } from "./ExpandStrip";

describe("ExpandStrip", () => {
  it("renders only an 'expand up' button at the start of a file", () => {
    render(<ExpandStrip showUp showDown={false} hiddenCount={40} onExpandUp={() => {}} onExpandAll={() => {}} />);
    expect(screen.getByRole("button", { name: "Expand up" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand down" })).not.toBeInTheDocument();
  });

  it("renders only an 'expand down' button at the end of a file", () => {
    render(<ExpandStrip showUp={false} showDown hiddenCount={null} onExpandDown={() => {}} onExpandAll={() => {}} />);
    expect(screen.getByRole("button", { name: "Expand down" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand up" })).not.toBeInTheDocument();
  });

  it("renders both buttons between two hunks with a large gap", () => {
    render(<ExpandStrip showUp showDown hiddenCount={40} onExpandUp={() => {}} onExpandDown={() => {}} onExpandAll={() => {}} />);
    expect(screen.getByRole("button", { name: "Expand up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand down" })).toBeInTheDocument();
  });

  it("calls the fixed-chunk handlers when the remaining gap is large", () => {
    const onExpandUp = vi.fn();
    const onExpandDown = vi.fn();
    render(
      <ExpandStrip
        showUp showDown hiddenCount={40}
        onExpandUp={onExpandUp} onExpandDown={onExpandDown} onExpandAll={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand up" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand down" }));
    expect(onExpandUp).toHaveBeenCalledTimes(1);
    expect(onExpandDown).toHaveBeenCalledTimes(1);
  });

  it("routes both buttons to onExpandAll once the gap is small enough to close in one click", () => {
    const onExpandUp = vi.fn();
    const onExpandDown = vi.fn();
    const onExpandAll = vi.fn();
    render(
      <ExpandStrip
        showUp showDown hiddenCount={6}
        onExpandUp={onExpandUp} onExpandDown={onExpandDown} onExpandAll={onExpandAll}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand up" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand down" }));
    expect(onExpandUp).not.toHaveBeenCalled();
    expect(onExpandDown).not.toHaveBeenCalled();
    expect(onExpandAll).toHaveBeenCalledTimes(2);
  });

  it("does not merge-all when the hidden count is unknown, even if it turns out small", () => {
    const onExpandDown = vi.fn();
    const onExpandAll = vi.fn();
    render(<ExpandStrip showUp={false} showDown hiddenCount={null} onExpandDown={onExpandDown} onExpandAll={onExpandAll} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand down" }));
    expect(onExpandDown).toHaveBeenCalledTimes(1);
    expect(onExpandAll).not.toHaveBeenCalled();
  });
});

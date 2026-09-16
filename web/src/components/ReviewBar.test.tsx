import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewBar } from "./ReviewBar";

function openPopover() {
  fireEvent.click(screen.getByText("Finish your review"));
}

describe("ReviewBar", () => {
  it("submits the summary with the clicked verdict type", () => {
    const onSubmit = vi.fn();
    render(<ReviewBar onSubmit={onSubmit} />);
    openPopover();
    fireEvent.change(screen.getByPlaceholderText("Leave a summary (optional)"), { target: { value: "looks good overall" } });
    fireEvent.click(screen.getByText("Approve"));
    expect(onSubmit).toHaveBeenCalledWith("approve", "looks good overall");
  });

  it("has Comment and Request changes buttons too", () => {
    render(<ReviewBar onSubmit={vi.fn()} />);
    openPopover();
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
  });

  it("clears the summary field and shows a confirmation after submitting", () => {
    render(<ReviewBar onSubmit={vi.fn()} />);
    openPopover();
    const textarea = screen.getByPlaceholderText("Leave a summary (optional)") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "please fix this" } });
    fireEvent.click(screen.getByText("Request changes"));
    expect(screen.getByText(/Request changes submitted/)).toBeInTheDocument();
  });

  it("hides the popover until 'Finish your review' is clicked", () => {
    render(<ReviewBar onSubmit={vi.fn()} />);
    expect(screen.queryByPlaceholderText("Leave a summary (optional)")).not.toBeInTheDocument();
    openPopover();
    expect(screen.getByPlaceholderText("Leave a summary (optional)")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewBar } from "./ReviewBar";

describe("ReviewBar", () => {
  it("submits the summary with the clicked verdict type", () => {
    const onSubmit = vi.fn();
    render(<ReviewBar onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText("Leave a summary (optional)"), { target: { value: "looks good overall" } });
    fireEvent.click(screen.getByText("Approve"));
    expect(onSubmit).toHaveBeenCalledWith("approve", "looks good overall");
  });

  it("has Comment and Request changes buttons too", () => {
    render(<ReviewBar onSubmit={vi.fn()} />);
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
  });
});

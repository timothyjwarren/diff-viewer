import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FileViewPage } from "./FileViewPage";
import { fetchFile } from "../api/client";

vi.mock("../api/client", () => ({ fetchFile: vi.fn() }));
vi.mock("shiki", () => ({
  codeToHtml: vi.fn(async (content: string) => `<pre><code>${content.replace(/\n/g, "\n")}</code></pre>`),
}));

describe("FileViewPage", () => {
  it("fetches the file at the given ref and renders each line with its line number", async () => {
    vi.mocked(fetchFile).mockResolvedValue(["first line", "second line"]);

    render(<FileViewPage repoPath="/repo" filePath="a.ts" gitRef="abc123" repoName="repo:main" />);

    expect(fetchFile).toHaveBeenCalledWith("/repo", "a.ts", "abc123");
    await waitFor(() => expect(screen.getByText("first line")).toBeInTheDocument());
    expect(screen.getByText("second line")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows the repo name and file path in the header", async () => {
    vi.mocked(fetchFile).mockResolvedValue(["one"]);
    render(<FileViewPage repoPath="/repo" filePath="a.ts" gitRef="abc123" repoName="repo:main" />);
    await waitFor(() => expect(screen.getByText(/a\.ts/)).toBeInTheDocument());
    expect(screen.getByText(/repo:main/)).toBeInTheDocument();
  });
});

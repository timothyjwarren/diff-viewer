import { describe, it, expect } from "vitest";
import { parseBrowseParams, buildBrowseUrl, toBrowseRef, dirLinkSegments } from "./route";

describe("parseBrowseParams", () => {
  it("reads repoPath, ref, path and line", () => {
    expect(parseBrowseParams("?repoPath=%2Frepo&ref=abc123&path=a%2Fb.ts&line=7")).toEqual({
      repoPath: "/repo", ref: "abc123", path: "a/b.ts", line: 7,
    });
  });

  it("defaults ref to uncommitted and path to the root", () => {
    expect(parseBrowseParams("?repoPath=%2Frepo")).toEqual({ repoPath: "/repo", ref: "uncommitted", path: "" });
  });

  it("drops a line that is not a positive integer", () => {
    for (const bad of ["0", "abc", "-3", "1.5", ""]) {
      expect(parseBrowseParams(`?repoPath=%2Fr&line=${bad}`).line).toBeUndefined();
    }
  });
});

describe("buildBrowseUrl", () => {
  it("round-trips paths with space, #, %, & and unicode", () => {
    const p = { repoPath: "/my repo/é", ref: "abc", path: "src/odd dir/a#b%c&d é.ts", line: 4 };
    const url = buildBrowseUrl(p);
    expect(url.startsWith("/view-file?")).toBe(true);
    expect(parseBrowseParams(url.slice(url.indexOf("?")))).toEqual(p);
  });

  it("omits line when absent", () => {
    expect(buildBrowseUrl({ repoPath: "/r", ref: "x", path: "" })).not.toContain("line=");
  });
});

describe("toBrowseRef", () => {
  it("maps working and uncommitted to uncommitted and leaves other refs alone", () => {
    expect(toBrowseRef("working")).toBe("uncommitted");
    expect(toBrowseRef("uncommitted")).toBe("uncommitted");
    expect(toBrowseRef("abc123")).toBe("abc123");
  });
});

describe("dirLinkSegments", () => {
  it("returns cumulative directory paths, excluding the filename", () => {
    expect(dirLinkSegments("foo/bar/baz/qux.json")).toEqual([
      { name: "foo", dirPath: "foo" },
      { name: "bar", dirPath: "foo/bar" },
      { name: "baz", dirPath: "foo/bar/baz" },
    ]);
  });

  it("is empty for a top-level file", () => {
    expect(dirLinkSegments("qux.json")).toEqual([]);
  });
});

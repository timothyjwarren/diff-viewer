import { describe, it, expect } from "vitest";
import { parseFileViewParams } from "./route";

describe("parseFileViewParams", () => {
  it("reads repoPath, file path, ref and repo name from the query string", () => {
    const search = "?repoPath=%2Frepo&path=a%2Fb.ts&ref=abc123&repoName=repo%3Amain";
    expect(parseFileViewParams(search)).toEqual({
      repoPath: "/repo", filePath: "a/b.ts", gitRef: "abc123", repoName: "repo:main",
    });
  });

  it("defaults the ref to the working tree when not specified", () => {
    const params = parseFileViewParams("?repoPath=%2Frepo&path=a.ts&repoName=repo");
    expect(params.gitRef).toBe("working");
  });
});

import { describe, it, expect } from "vitest";
import { parseRepoArgs } from "./parseRepoArgs.js";

describe("parseRepoArgs", () => {
  it("parses a bare path with no override", () => {
    expect(parseRepoArgs(["/r/repoA"])).toEqual([{ path: "/r/repoA" }]);
  });

  it("parses a path with a baseRef override", () => {
    expect(parseRepoArgs(["/r/repoB:side-branch"])).toEqual([{ path: "/r/repoB", baseRef: "side-branch" }]);
  });

  it("parses multiple mixed args", () => {
    expect(parseRepoArgs(["/r/a", "/r/b:main-side"])).toEqual([
      { path: "/r/a" },
      { path: "/r/b", baseRef: "main-side" },
    ]);
  });
});

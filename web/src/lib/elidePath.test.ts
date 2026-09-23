import { describe, it, expect } from "vitest";
import { elideDir } from "./elidePath";

/** A `fits` predicate that accepts any dir+base string up to `max` characters. */
const fitsIn = (max: number) => (text: string) => text.length <= max;

describe("elideDir", () => {
  const dir = "foo/bar/baz/src";
  const base = "file.py";

  it("keeps the whole directory when it fits", () => {
    expect(elideDir(dir, base, fitsIn(100))).toBe("foo/bar/baz/src/");
  });

  it("returns an empty directory for a top-level file", () => {
    expect(elideDir("", base, fitsIn(3))).toBe("");
  });

  it("elides middle directories, keeping the first and as many trailing ones as fit", () => {
    // "foo/…/baz/src/file.py" is 21 chars; "foo/…/src/file.py" is 17.
    expect(elideDir(dir, base, fitsIn(21))).toBe("foo/…/baz/src/");
    expect(elideDir(dir, base, fitsIn(20))).toBe("foo/…/src/");
  });

  it("falls back to first/…/ and then …/ as space runs out", () => {
    // "foo/…/file.py" is 13 chars; "…/file.py" is 9.
    expect(elideDir(dir, base, fitsIn(13))).toBe("foo/…/");
    expect(elideDir(dir, base, fitsIn(12))).toBe("…/");
  });

  it("drops the directory entirely when even …/ doesn't fit", () => {
    expect(elideDir(dir, base, fitsIn(8))).toBe("");
  });

  it("never elides a single directory to something longer than itself", () => {
    expect(elideDir("a", base, fitsIn(9))).toBe("a/");
    expect(elideDir("src", base, fitsIn(10))).toBe("…/");
  });
});

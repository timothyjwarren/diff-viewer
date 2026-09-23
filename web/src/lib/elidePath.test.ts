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

  it("elides from the middle outward, keeping the root", () => {
    // "foo/bar/…/src/file.py" is 21 chars; "foo/…/src/file.py" is 17.
    expect(elideDir(dir, base, fitsIn(21))).toBe("foo/bar/…/src/");
    expect(elideDir(dir, base, fitsIn(20))).toBe("foo/…/src/");
  });

  it("removes the middle of a long path evenly from both sides", () => {
    const deep = "a1/b2/c3/d4/e5/f6/g7";
    // Full is 22 chars with "x". Dropping from the middle removes d4, then
    // d4/e5, then c3/d4/e5 -- an odd leftover goes to the filename's side.
    expect(elideDir(deep, "x", fitsIn(22))).toBe("a1/b2/c3/d4/e5/f6/g7/");
    expect(elideDir(deep, "x", fitsIn(21))).toBe("a1/b2/c3/…/e5/f6/g7/");
    expect(elideDir(deep, "x", fitsIn(20))).toBe("a1/b2/c3/…/f6/g7/");
    expect(elideDir(deep, "x", fitsIn(17))).toBe("a1/b2/…/f6/g7/");
  });

  it("keeps root/…/ as the shortest form, even when it doesn't fit", () => {
    expect(elideDir(dir, base, fitsIn(13))).toBe("foo/…/");
    expect(elideDir(dir, base, fitsIn(3))).toBe("foo/…/");
  });

  it("never elides a single directory", () => {
    expect(elideDir("src", base, fitsIn(3))).toBe("src/");
  });
});

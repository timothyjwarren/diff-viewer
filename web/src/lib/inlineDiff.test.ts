import { describe, it, expect } from "vitest";
import { inlineChanges } from "./inlineDiff";

const slices = (text: string, ranges: [number, number][]) => ranges.map(([s, e]) => text.slice(s, e));

describe("inlineChanges", () => {
  it("marks only the inserted part of a line", () => {
    const oldText = "<div className={x}>";
    const newText = "<div id={y} className={x}>";
    const changes = inlineChanges(oldText, newText)!;
    expect(changes.old).toEqual([]);
    expect(slices(newText, changes.new)).toEqual(["id={y} "]);
  });

  it("marks the replaced word on both sides", () => {
    const oldText = "const total = count + 1;";
    const newText = "const total = amount + 1;";
    const changes = inlineChanges(oldText, newText)!;
    expect(slices(oldText, changes.old)).toEqual(["count"]);
    expect(slices(newText, changes.new)).toEqual(["amount"]);
  });

  it("joins changes separated only by whitespace", () => {
    const oldText = "return foo bar;";
    const newText = "return baz qux;";
    const changes = inlineChanges(oldText, newText)!;
    expect(slices(oldText, changes.old)).toEqual(["foo bar"]);
    expect(slices(newText, changes.new)).toEqual(["baz qux"]);
  });

  it("keeps separate changes apart when non-whitespace sits between them", () => {
    const oldText = "f(a, b, c)";
    const newText = "f(x, b, y)";
    const changes = inlineChanges(oldText, newText)!;
    expect(slices(newText, changes.new)).toEqual(["x", "y"]);
  });

  it("returns nothing for lines too different to compare usefully", () => {
    expect(inlineChanges("import React from 'react';", "  return total * 2;")).toBeNull();
  });

  it("returns nothing for identical lines", () => {
    expect(inlineChanges("same", "same")).toBeNull();
  });

  it("returns nothing for very long lines", () => {
    const long = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(" ");
    expect(inlineChanges(long, long + " extra")).toBeNull();
  });
});

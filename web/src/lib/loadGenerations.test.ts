import { describe, it, expect } from "vitest";
import { LoadGenerations } from "./loadGenerations";

describe("LoadGenerations", () => {
  it("keeps only the newest full load current", () => {
    const g = new LoadGenerations();
    const first = g.beginAll();
    const second = g.beginAll();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("supersedes a repo load with a newer load of the same repo, but not of another repo", () => {
    const g = new LoadGenerations();
    const a1 = g.beginRepo("/a");
    const b = g.beginRepo("/b");
    const a2 = g.beginRepo("/a");
    expect([a1(), a2(), b()]).toEqual([false, true, true]);
  });

  it("supersedes in-flight repo loads with a full load", () => {
    const g = new LoadGenerations();
    const a = g.beginRepo("/a");
    g.beginAll();
    expect(a()).toBe(false);
  });
});

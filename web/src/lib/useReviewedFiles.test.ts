import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReviewedFiles } from "./useReviewedFiles";
import type { DiffFile } from "../types";

function makeFile(path: string, content = "x"): DiffFile {
  return {
    repoPath: "/r", oldPath: path, newPath: path, status: "modified",
    hunks: [{
      oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
      lines: [{ type: "add", oldLineNumber: null, newLineNumber: 1, content }],
    }],
  };
}

const a = makeFile("a.ts");
const b = makeFile("b.ts");

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("useReviewedFiles", () => {
  it("collapses a file when it is marked reviewed and expands it when unmarked", () => {
    const { result } = renderHook(() => useReviewedFiles("s1", null, [a, b]));
    act(() => result.current.toggleReviewed(a));
    expect(result.current.isReviewed(a)).toBe(true);
    expect(result.current.isCollapsed(a)).toBe(true);
    expect(result.current.isCollapsed(b)).toBe(false);
    expect(result.current.reviewedCount).toBe(1);
    act(() => result.current.toggleReviewed(a));
    expect(result.current.isCollapsed(a)).toBe(false);
  });

  it("expands then re-collapses all reviewed files, leaving them reviewed", () => {
    const { result } = renderHook(() => useReviewedFiles("s1", null, [a, b]));
    act(() => result.current.toggleReviewed(a));
    act(() => result.current.toggleReviewed(b));
    expect(result.current.anyReviewedCollapsed).toBe(true);
    act(() => result.current.toggleAllReviewed());
    expect(result.current.isCollapsed(a)).toBe(false);
    expect(result.current.isCollapsed(b)).toBe(false);
    expect(result.current.reviewedCount).toBe(2);
    expect(result.current.anyReviewedCollapsed).toBe(false);
    act(() => result.current.toggleAllReviewed());
    expect(result.current.isCollapsed(a)).toBe(true);
    expect(result.current.isCollapsed(b)).toBe(true);
  });

  it("does not collapse unreviewed files when collapsing reviewed ones", () => {
    const { result } = renderHook(() => useReviewedFiles("s1", null, [a, b]));
    act(() => result.current.toggleReviewed(a));
    act(() => result.current.toggleAllReviewed());
    act(() => result.current.toggleAllReviewed());
    expect(result.current.isCollapsed(b)).toBe(false);
  });

  it("restores reviewed marks, collapsed, after a reload", () => {
    const first = renderHook(() => useReviewedFiles("s1", null, [a, b]));
    act(() => first.result.current.toggleReviewed(a));
    first.unmount();
    const { result } = renderHook(() => useReviewedFiles("s1", null, [a, b]));
    expect(result.current.isReviewed(a)).toBe(true);
    expect(result.current.isCollapsed(a)).toBe(true);
    expect(result.current.isReviewed(b)).toBe(false);
  });

  it("drops a reviewed mark when the file's diff changes", () => {
    const first = renderHook(() => useReviewedFiles("s1", null, [a]));
    act(() => first.result.current.toggleReviewed(a));
    first.unmount();
    const edited = makeFile("a.ts", "different");
    const { result } = renderHook(() => useReviewedFiles("s1", null, [edited]));
    expect(result.current.isReviewed(edited)).toBe(false);
    expect(result.current.isCollapsed(edited)).toBe(false);
  });

  it("drops all reviewed marks when the session's comments are replaced", () => {
    const first = renderHook(() => useReviewedFiles("s1", null, [a]));
    act(() => first.result.current.toggleReviewed(a));
    first.unmount();
    const { result } = renderHook(() => useReviewedFiles("s1", "2026-10-05T00:00:00Z", [a]));
    expect(result.current.isReviewed(a)).toBe(false);
  });

  it("drops marks when the session is cleared while the page is open", () => {
    const { result, rerender } = renderHook(
      ({ at }: { at: string | null }) => useReviewedFiles("s1", at, [a]),
      { initialProps: { at: null as string | null } },
    );
    act(() => result.current.toggleReviewed(a));
    rerender({ at: "2026-10-05T00:00:00Z" });
    expect(result.current.isReviewed(a)).toBe(false);
  });

  it("keeps marks per session", () => {
    const first = renderHook(() => useReviewedFiles("s1", null, [a]));
    act(() => first.result.current.toggleReviewed(a));
    first.unmount();
    const { result } = renderHook(() => useReviewedFiles("s2", null, [a]));
    expect(result.current.isReviewed(a)).toBe(false);
  });
});

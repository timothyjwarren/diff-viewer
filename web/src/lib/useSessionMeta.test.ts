import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionMeta, SESSION_META_POLL_MS } from "./useSessionMeta";
import * as client from "../api/client";
import type { SessionMeta } from "../types";

vi.mock("../api/client", () => ({ fetchSession: vi.fn(), fetchSessionMeta: vi.fn() }));

describe("useSessionMeta", () => {
  let meta: SessionMeta;

  beforeEach(() => {
    vi.useFakeTimers();
    meta = { title: "t", description: "first" };
    vi.mocked(client.fetchSession).mockImplementation(async () => ({ id: "s1", ...meta }));
    vi.mocked(client.fetchSessionMeta).mockImplementation(async () => ({ ...meta }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function poll() {
    await act(async () => { await vi.advanceTimersByTimeAsync(SESSION_META_POLL_MS); });
  }

  it("loads the session and picks up a new description on the next poll", async () => {
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    expect(result.current).toMatchObject({ sessionId: "s1", title: "t", description: "first", wasReset: false });

    meta = { ...meta, description: "second" };
    await poll();
    expect(result.current.description).toBe("second");
  });

  it("flags a reset that happens while the page is open, until dismissed", async () => {
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    await poll();
    expect(result.current.wasReset).toBe(false);

    meta = { ...meta, resetAt: "2026-09-28T12:00:00.000Z" };
    await poll();
    expect(result.current.wasReset).toBe(true);

    act(() => result.current.dismissReset());
    await poll();
    expect(result.current.wasReset).toBe(false);
  });

  it("does not flag a reset that happened before the page loaded", async () => {
    meta = { ...meta, resetAt: "2026-09-28T12:00:00.000Z" };
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    await poll();
    expect(result.current.wasReset).toBe(false);
  });
});

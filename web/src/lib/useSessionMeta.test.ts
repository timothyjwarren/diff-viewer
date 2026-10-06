import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionMeta, SESSION_META_POLL_MS, UNREACHABLE_AFTER_FAILURES } from "./useSessionMeta";
import * as client from "../api/client";
import type { SessionMeta } from "../types";

vi.mock("../api/client", () => ({ fetchSession: vi.fn(), fetchSessionMeta: vi.fn() }));

describe("useSessionMeta", () => {
  let meta: SessionMeta;

  beforeEach(() => {
    vi.useFakeTimers();
    meta = { title: "t", description: "first", agentListening: false };
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
    expect(result.current).toMatchObject({ sessionId: "s1", title: "t", description: "first", commentsReplacedBy: null });

    meta = { ...meta, description: "second" };
    await poll();
    expect(result.current.description).toBe("second");
  });

  it("reports a reset or restore that happens while the page is open, until dismissed", async () => {
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    await poll();
    expect(result.current.commentsReplacedBy).toBeNull();

    meta = { ...meta, commentsReplaced: { at: "2026-09-28T12:00:00.000Z", by: "reset" } };
    await poll();
    expect(result.current.commentsReplacedBy).toBe("reset");

    act(() => result.current.dismissCommentsReplaced());
    await poll();
    expect(result.current.commentsReplacedBy).toBeNull();

    meta = { ...meta, commentsReplaced: { at: "2026-09-28T12:05:00.000Z", by: "restore" } };
    await poll();
    expect(result.current.commentsReplacedBy).toBe("restore");
  });

  it("does not report a reset that happened before the page loaded", async () => {
    meta = { ...meta, commentsReplaced: { at: "2026-09-28T12:00:00.000Z", by: "reset" } };
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    await poll();
    expect(result.current.commentsReplacedBy).toBeNull();
  });

  it("reports whether an agent is listening", async () => {
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    await poll();
    expect(result.current.agentListening).toBe(false);

    meta = { ...meta, agentListening: true };
    await poll();
    expect(result.current.agentListening).toBe(true);
  });

  it("reports the server unreachable after repeated failed polls, and reachable again once one succeeds", async () => {
    const { result } = renderHook(() => useSessionMeta());
    await act(async () => {});
    expect(result.current.serverReachable).toBe(true);

    vi.mocked(client.fetchSessionMeta).mockRejectedValue(new Error("down"));
    for (let i = 1; i < UNREACHABLE_AFTER_FAILURES; i++) {
      await poll();
      expect(result.current.serverReachable).toBe(true);
    }
    await poll();
    expect(result.current.serverReachable).toBe(false);

    vi.mocked(client.fetchSessionMeta).mockImplementation(async () => ({ ...meta }));
    await poll();
    expect(result.current.serverReachable).toBe(true);
  });
});

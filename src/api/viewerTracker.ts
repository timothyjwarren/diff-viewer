import { EventEmitter } from "node:events";

export interface ViewerTimeouts {
  /** How long to wait for the first browser to connect after the server starts. */
  firstConnectMs: number;
  /** How long a viewer stays counted after its last heartbeat. */
  heartbeatMs: number;
  /** How long a viewer stays counted after it says goodbye (covers a page reload). */
  byeGraceMs: number;
}

export const DEFAULT_VIEWER_TIMEOUTS: ViewerTimeouts = {
  firstConnectMs: 10 * 60_000,
  heartbeatMs: 90_000,
  byeGraceMs: 10_000,
};

/**
 * Tracks which browser viewers are open. Each viewer heartbeats by polling the
 * server; a viewer that stops heartbeating, or says goodbye, expires. Emits
 * "closed" once, via `close()`, so held-open waits can end with a reason.
 */
export class ViewerTracker {
  readonly emitter = new EventEmitter();
  private readonly expiries = new Map<string, number>();
  private readonly startedAt: number;

  constructor(
    private readonly timeouts: ViewerTimeouts = DEFAULT_VIEWER_TIMEOUTS,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  heartbeat(viewerId: string): void {
    this.expiries.set(viewerId, this.now() + this.timeouts.heartbeatMs);
  }

  leave(viewerId: string): void {
    if (this.expiries.has(viewerId)) this.expiries.set(viewerId, this.now() + this.timeouts.byeGraceMs);
  }

  /** True once no viewer is open and none can be expected: all expired, or none ever connected in time. */
  shouldClose(): boolean {
    const now = this.now();
    if (this.expiries.size === 0) return now - this.startedAt >= this.timeouts.firstConnectMs;
    return [...this.expiries.values()].every(expiry => expiry <= now);
  }

  close(): void {
    this.emitter.emit("closed");
  }
}

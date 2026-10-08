import { describe, it, expect } from "vitest";
import { ViewerTracker } from "./viewerTracker.js";

describe("ViewerTracker", () => {
  const timeouts = { firstConnectMs: 600, heartbeatMs: 90, byeGraceMs: 10 };
  let now = 0;
  const make = () => { now = 0; return new ViewerTracker(timeouts, () => now); };

  it("waits the first-connect window when no viewer ever connects", () => {
    const tracker = make();
    now = 599;
    expect(tracker.shouldClose()).toBe(false);
    now = 600;
    expect(tracker.shouldClose()).toBe(true);
  });

  it("stays open while a viewer keeps heartbeating, even past the first-connect window", () => {
    const tracker = make();
    for (now = 50; now < 1000; now += 50) tracker.heartbeat("a");
    expect(tracker.shouldClose()).toBe(false);
  });

  it("closes once the last viewer stops heartbeating for the heartbeat window", () => {
    const tracker = make();
    now = 100;
    tracker.heartbeat("a");
    now = 189;
    expect(tracker.shouldClose()).toBe(false);
    now = 190;
    expect(tracker.shouldClose()).toBe(true);
  });

  it("closes soon after a lone viewer says bye, but not if another viewer remains", () => {
    const tracker = make();
    tracker.heartbeat("a");
    tracker.heartbeat("b");
    tracker.leave("a");
    now = 20;
    expect(tracker.shouldClose()).toBe(false);
    tracker.leave("b");
    now = 29;
    expect(tracker.shouldClose()).toBe(false);
    now = 30;
    expect(tracker.shouldClose()).toBe(true);
  });

  it("a reloaded page's new heartbeat keeps the server open after the old page said bye", () => {
    const tracker = make();
    tracker.heartbeat("old");
    tracker.leave("old");
    now = 5;
    tracker.heartbeat("new");
    now = 50;
    expect(tracker.shouldClose()).toBe(false);
  });

  it("a bye from an unknown viewer is ignored", () => {
    const tracker = make();
    tracker.leave("ghost");
    now = 100;
    expect(tracker.shouldClose()).toBe(false);
  });
});

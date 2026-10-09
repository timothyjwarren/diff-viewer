import { describe, it, expect } from "vitest";
import { annotateHtml, BRIDGE_SOURCE } from "./htmlAnnotate.js";

const opts = { scripts: false, nonce: "abc123" };

describe("annotateHtml", () => {
  it("tags each element with its 1-based source start line", () => {
    const src = "<!doctype html>\n<html>\n<body>\n<h1>Hi</h1>\n<p>\n  one <b>two</b>\n</p>\n</body></html>";
    const out = annotateHtml(src, opts);
    expect(out).toContain('<h1 data-dv-line="4">');
    expect(out).toContain('<p data-dv-line="5">');
    expect(out).toContain('<b data-dv-line="6">');
  });

  it("uses the line where a multi-line start tag begins", () => {
    const out = annotateHtml('<body>\n<div\n  class="x"\n  id="y">t</div></body>', opts);
    expect(out).toMatch(/<div class="x" id="y" data-dv-line="2">/);
  });

  it("annotates elements inside <template>", () => {
    const out = annotateHtml("<body>\n<template>\n<span>t</span>\n</template></body>", opts);
    expect(out).toContain('<span data-dv-line="3">');
  });

  it("handles fragments with no html/head and unclosed tags", () => {
    const out = annotateHtml("<div><p>unclosed\n<b>bold", opts);
    expect(out).toContain('<div data-dv-line="1">');
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain(BRIDGE_SOURCE);
  });

  it("puts the policy meta and bridge first in <head>, ahead of the page's own head content", () => {
    const out = annotateHtml('<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><title>t</title></head></html>', opts);
    const head = out.slice(out.indexOf("<head"));
    expect(head.indexOf("script-src 'nonce-abc123'")).toBeLessThan(head.indexOf("default-src *"));
  });

  it("with scripts off, allows only the nonced bridge to run", () => {
    const out = annotateHtml("<p>x</p>", opts);
    expect(out).toContain("script-src 'nonce-abc123'");
    expect(out).not.toMatch(/script-src[^;"]*unsafe-inline/);
    expect(out).toContain('<script nonce="abc123">');
  });

  it("with scripts on, allows inline and https scripts and uses no nonce in the policy", () => {
    const out = annotateHtml("<p>x</p>", { scripts: true, nonce: "abc123" });
    expect(out).toContain("script-src 'unsafe-inline' https:");
    expect(out).not.toMatch(/content="[^"]*nonce-/);
  });

  it("always denies everything not listed (default-src 'none')", () => {
    for (const scripts of [false, true]) {
      expect(annotateHtml("<p>x</p>", { scripts, nonce: "n" })).toContain("default-src 'none'");
    }
  });

  it("emits a bridge that is syntactically valid JavaScript", () => {
    expect(() => new Function(BRIDGE_SOURCE)).not.toThrow();
  });
});

type Listener = (e?: unknown) => void;

/** Runs the bridge against minimal stand-ins for the iframe's document, window and parent. */
function runBridge(opts: { height?: () => number } = {}) {
  const timers: Array<() => void> = [];
  const docListeners: Record<string, Listener[]> = {};
  const winListeners: Record<string, Listener[]> = {};
  const posted: unknown[] = [];
  const doc = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    documentElement: { getBoundingClientRect: () => ({ height: opts.height ? opts.height() : 776.4 }) },
    createElement: () => ({ style: {}, setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } }),
    addEventListener: (t: string, f: Listener) => { (docListeners[t] ??= []).push(f); },
    querySelectorAll: () => ({ forEach: () => {} }),
  };
  const win = {
    scrollX: 0, scrollY: 10,
    addEventListener: (t: string, f: Listener) => { (winListeners[t] ??= []).push(f); },
  };
  const parent = { postMessage: (m: unknown) => { posted.push(m); } };
  new Function("document", "window", "parent", "setTimeout", BRIDGE_SOURCE)(doc, win, parent, (f: () => void) => { timers.push(f); });
  return { docListeners, winListeners, posted, timers };
}

describe("bridge", () => {
  it("reports a clicked element's source line and its rectangle in document coordinates", () => {
    const { docListeners, posted } = runBridge();
    const el = {
      getAttribute: (n: string) => (n === "data-dv-line" ? "7" : null),
      getBoundingClientRect: () => ({ top: 20, left: 5, width: 100, height: 30 }),
    };
    const target = { closest: (sel: string) => (sel === "[data-dv-line]" ? el : null) };
    docListeners.click[0]({ target, preventDefault: () => {} });
    expect(posted).toContainEqual({ type: "dv-click", line: 7, rect: { top: 30, left: 5, width: 100, height: 30 } });
  });

  it("reports a clicked marker's thread and rectangle instead of the element underneath", () => {
    const { docListeners, posted } = runBridge();
    const marker = {
      getAttribute: (n: string) => (n === "data-thread-id" ? "t1" : null),
      getBoundingClientRect: () => ({ top: 1, left: 2, width: 18, height: 18 }),
    };
    const target = { closest: (sel: string) => (sel === ".dv-marker" ? marker : null) };
    docListeners.click[0]({ target, preventDefault: () => {} });
    expect(posted).toEqual([{ type: "dv-marker-click", threadId: "t1", rect: { top: 11, left: 2, width: 18, height: 18 } }]);
  });

  it("reports the page's own height (not the viewport's) on load", () => {
    const { winListeners, posted } = runBridge();
    winListeners.load[0]();
    expect(posted).toContainEqual({ type: "dv-height", height: 777 });
  });

  it("does not report a zero height (page not laid out yet) and retries until it has one", () => {
    let h = 0;
    const { winListeners, posted, timers } = runBridge({ height: () => h });
    winListeners.load[0]();
    expect(posted).toEqual([]);
    expect(timers).toHaveLength(1);
    h = 500;
    timers.shift()!();
    expect(posted).toEqual([{ type: "dv-height", height: 500 }]);
  });
});

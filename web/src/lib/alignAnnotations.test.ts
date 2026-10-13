import { describe, it, expect } from "vitest";
import { alignAnnotationSlots, alignRowHeights } from "./alignAnnotations";

function slot(root: HTMLElement, key: string, height: number): HTMLElement {
  const outer = document.createElement("div");
  outer.className = "diff-row-annotations";
  outer.dataset.rowKey = key;
  const inner = document.createElement("div");
  inner.className = "diff-row-annotations-inner";
  inner.getBoundingClientRect = () => ({ height } as DOMRect);
  outer.appendChild(inner);
  root.appendChild(outer);
  return outer;
}

describe("alignAnnotationSlots", () => {
  it("sizes every slot sharing a row key to the tallest one's content", () => {
    const root = document.createElement("div");
    const oldSlot = slot(root, "0:3", 140);
    const newSlot = slot(root, "0:3", 0);

    alignAnnotationSlots(root);

    expect(oldSlot.style.minHeight).toBe("140px");
    expect(newSlot.style.minHeight).toBe("140px");
  });

  it("aligns each row key independently", () => {
    const root = document.createElement("div");
    const a = [slot(root, "0:1", 80), slot(root, "0:1", 30)];
    const b = [slot(root, "1:0", 0), slot(root, "1:0", 200)];

    alignAnnotationSlots(root);

    expect(a.map(s => s.style.minHeight)).toEqual(["80px", "80px"]);
    expect(b.map(s => s.style.minHeight)).toEqual(["200px", "200px"]);
  });
});

function line(root: HTMLElement, key: string, height: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "diff-line";
  el.dataset.rowKey = key;
  el.getBoundingClientRect = () => ({ height: el.style.minHeight ? Math.max(height, parseFloat(el.style.minHeight)) : height } as DOMRect);
  root.appendChild(el);
  return el;
}

describe("alignRowHeights", () => {
  it("sizes paired lines to the taller one when wrapping makes them differ", () => {
    const root = document.createElement("div");
    const oldLine = line(root, "0:2", 20);
    const newLine = line(root, "0:2", 60);

    alignRowHeights(root, true);

    expect(oldLine.style.minHeight).toBe("60px");
    expect(newLine.style.minHeight).toBe("60px");
  });

  it("measures natural heights, ignoring heights set by an earlier pass", () => {
    const root = document.createElement("div");
    const a = line(root, "0:0", 20);
    const b = line(root, "0:0", 60);
    alignRowHeights(root, true);
    b.getBoundingClientRect = () => ({ height: 20 } as DOMRect);

    alignRowHeights(root, true);

    expect(a.style.minHeight).toBe("20px");
    expect(b.style.minHeight).toBe("20px");
  });

  it("clears the heights when wrapping is off", () => {
    const root = document.createElement("div");
    const a = line(root, "0:0", 20);
    const b = line(root, "0:0", 60);
    alignRowHeights(root, true);

    alignRowHeights(root, false);

    expect(a.style.minHeight).toBe("");
    expect(b.style.minHeight).toBe("");
  });
});

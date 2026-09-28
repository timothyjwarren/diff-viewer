import { describe, it, expect } from "vitest";
import { alignAnnotationSlots } from "./alignAnnotations";

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

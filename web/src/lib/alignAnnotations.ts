import { useLayoutEffect, type RefObject } from "react";

/**
 * The two panes of a side-by-side diff lay out independently, so a comment
 * thread under a line in one pane would push only that pane's following
 * lines down. Each row carrying annotations on either side renders a
 * `.diff-row-annotations` slot in both panes, keyed by the row; this sizes
 * every slot sharing a key to the tallest slot's content, so the side
 * without a thread gets a blank block of matching height.
 */
export function alignAnnotationSlots(root: HTMLElement) {
  const tallest = new Map<string, number>();
  const slots = root.querySelectorAll<HTMLElement>(".diff-row-annotations");
  for (const slot of slots) {
    const inner = slot.querySelector<HTMLElement>(".diff-row-annotations-inner");
    const height = inner?.getBoundingClientRect().height ?? 0;
    const key = slot.dataset.rowKey ?? "";
    tallest.set(key, Math.max(tallest.get(key) ?? 0, height));
  }
  for (const slot of slots) {
    const minHeight = `${tallest.get(slot.dataset.rowKey ?? "") ?? 0}px`;
    if (slot.style.minHeight !== minHeight) slot.style.minHeight = minHeight;
  }
}

/**
 * Keeps annotation slots under `rootRef` aligned across panes, re-running
 * after every render (slots come and go with threads and the composer) and
 * whenever a slot's content resizes on its own (a reply box opening, a
 * composer textarea growing).
 */
export function useAlignedAnnotations(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    alignAnnotationSlots(root);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => alignAnnotationSlots(root));
    root.querySelectorAll(".diff-row-annotations-inner").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  });
}

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
 * With soft wrapping, the same row can wrap to different heights in the two
 * panes. Every `.diff-line` carries its row's key; this sizes all lines
 * sharing a key to the tallest one's natural height. Heights from a previous
 * pass are cleared first so lines can shrink again when a pane widens, and
 * stay cleared when `wrap` is off.
 */
export function alignRowHeights(root: HTMLElement, wrap: boolean) {
  const lines = root.querySelectorAll<HTMLElement>(".diff-line[data-row-key]");
  for (const line of lines) line.style.minHeight = "";
  if (!wrap) return;
  const tallest = new Map<string, number>();
  for (const line of lines) {
    const key = line.dataset.rowKey ?? "";
    tallest.set(key, Math.max(tallest.get(key) ?? 0, line.getBoundingClientRect().height));
  }
  for (const line of lines) {
    line.style.minHeight = `${tallest.get(line.dataset.rowKey ?? "") ?? 0}px`;
  }
}

/**
 * Keeps annotation slots (and, when `wrap` is on, wrapped lines) under
 * `rootRef` aligned across panes, re-running after every render (slots come
 * and go with threads and the composer) and whenever a slot's content or a
 * pane's width changes on its own (a reply box opening, a composer textarea
 * growing, the divider being dragged).
 */
export function useAlignedAnnotations(rootRef: RefObject<HTMLElement | null>, wrap = false) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const align = () => {
      alignRowHeights(root, wrap);
      alignAnnotationSlots(root);
    };
    align();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(align);
    root.querySelectorAll(".diff-row-annotations-inner").forEach(el => observer.observe(el));
    if (wrap) root.querySelectorAll(".diff-pane").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  });
}

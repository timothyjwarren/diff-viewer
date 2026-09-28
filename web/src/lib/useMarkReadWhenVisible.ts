import { useEffect, useRef, useState } from "react";

/** A comment counts as seen once half of it, or half the viewport's height of it, is on screen. */
const THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

function isMostlyVisible(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= 0.5) return true;
  // A comment taller than twice the viewport can never be half visible.
  const rootHeight = entry.rootBounds?.height;
  return rootHeight != null && entry.intersectionRect.height >= rootHeight / 2;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * Calls `onVisible` with each id in `commentIds` once its `comment-<id>`
 * element is mostly on screen while the page is in the foreground, so
 * comments that arrive in a background tab stay unread until looked at.
 */
export function useMarkReadWhenVisible(commentIds: string[], onVisible: ((commentId: string) => void) | undefined): void {
  const pageVisible = useDocumentVisible();
  const onVisibleRef = useRef(onVisible);
  useEffect(() => { onVisibleRef.current = onVisible; });
  const key = commentIds.join(",");
  const enabled = Boolean(onVisible);

  useEffect(() => {
    if (!key || !enabled || !pageVisible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!isMostlyVisible(entry)) continue;
        observer.unobserve(entry.target);
        onVisibleRef.current?.(entry.target.id.slice("comment-".length));
      }
    }, { threshold: THRESHOLDS });
    for (const id of key.split(",")) {
      const el = document.getElementById(`comment-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key, enabled, pageVisible]);
}

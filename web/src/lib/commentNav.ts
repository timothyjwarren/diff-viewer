export interface CommentPosition {
  id: string;
  top: number;
}

const VIEWPORT_EPSILON = 10;

/**
 * Finds the comment adjacent to the current viewport in the given direction,
 * for the Cmd+Shift+Up/Down comment-navigation shortcut. `entries` must be
 * in document order. No wraparound: past either end this returns null.
 */
export function findAdjacentComment(
  entries: CommentPosition[],
  direction: "next" | "previous",
  currentId?: string | null,
): string | null {
  if (direction === "next") {
    return entries.find(e => e.top > VIEWPORT_EPSILON && e.id !== currentId)?.id ?? null;
  }
  const above = entries.filter(e => e.top < -VIEWPORT_EPSILON && e.id !== currentId);
  return above.length > 0 ? above[above.length - 1].id : null;
}

/** True when `target` is a form control the comment-nav shortcut should leave alone. */
export function isEditableTarget(target: Element | null): boolean {
  if (!target) return false;
  return target.tagName === "TEXTAREA" || target.tagName === "INPUT";
}

export interface CommentPosition {
  id: string;
  /** Id of this comment's thread root -- its own id, if it is the root. */
  rootId: string;
  top: number;
}

const VIEWPORT_EPSILON = 10;

/**
 * Finds the comment *thread root* adjacent to the current viewport in the
 * given direction, for the Cmd+Shift+Up/Down comment-navigation shortcut.
 * `entries` must include every comment -- root and replies alike -- in
 * document order: replies are never returned as a navigation target, but
 * they're needed to detect which chain the viewport is currently positioned
 * inside (see `impliedCurrentRoot`). No wraparound: past either end this
 * returns null.
 */
export function findAdjacentComment(
  entries: CommentPosition[],
  direction: "next" | "previous",
  currentRootId?: string | null,
): string | null {
  const excludeId = currentRootId ?? impliedCurrentRoot(entries);
  const roots = entries.filter(e => e.id === e.rootId);

  if (direction === "next") {
    return roots.find(e => e.top > VIEWPORT_EPSILON && e.id !== excludeId)?.id ?? null;
  }
  const above = roots.filter(e => e.top < -VIEWPORT_EPSILON && e.id !== excludeId);
  return above.length > 0 ? above[above.length - 1].id : null;
}

/**
 * When no current comment is being tracked yet (e.g. the shortcut hasn't
 * been used this session), infers which chain the viewport is already
 * positioned inside by finding the last comment -- root or reply -- scrolled
 * past. Only a *reply* implies the viewport is already past that chain's own
 * root and it should be skipped; if the nearest passed comment is itself a
 * root, there's nothing to exclude -- landing on it is correct.
 */
function impliedCurrentRoot(entries: CommentPosition[]): string | null {
  const passed = entries.filter(e => e.top < VIEWPORT_EPSILON);
  if (passed.length === 0) return null;
  const nearest = passed[passed.length - 1];
  return nearest.id === nearest.rootId ? null : nearest.rootId;
}

/** True when `target` is a form control the comment-nav shortcut should leave alone. */
export function isEditableTarget(target: Element | null): boolean {
  if (!target) return false;
  return target.tagName === "TEXTAREA" || target.tagName === "INPUT";
}

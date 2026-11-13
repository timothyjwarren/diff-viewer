export interface FileRect {
  id: string;
  /** Top and bottom edges, relative to the scroll viewport's top edge. */
  top: number;
  bottom: number;
}

/**
 * The run of files currently on screen, from the first visible file to the
 * last. Drives the sidebar's viewport indicator, which wraps their rows.
 */
export interface ViewportSpan {
  startId: string;
  endId: string;
}

/** `files` must be in document order. */
export function computeViewportSpan(files: FileRect[], viewportHeight: number): ViewportSpan | null {
  const visible = files.filter(f => f.bottom > 0 && f.top < viewportHeight);
  if (visible.length === 0) return null;
  return { startId: visible[0].id, endId: visible[visible.length - 1].id };
}

/** Breathing room kept between the revealed rows and the sidebar's edge, so a neighbouring row stays in sight. */
export const REVEAL_MARGIN = 32;

/**
 * Where to scroll the sidebar so the rows from `top` to `bottom` (in its
 * content coordinates) are on screen, moving it as little as possible; or
 * null when they already are. Rows taller than the sidebar show their top.
 */
export function scrollTopToReveal(
  top: number, bottom: number, scrollTop: number, viewHeight: number, margin = REVEAL_MARGIN,
): number | null {
  if (top >= scrollTop && bottom <= scrollTop + viewHeight) return null;
  const tooTall = bottom - top + 2 * margin > viewHeight;
  const target = top < scrollTop || tooTall ? top - margin : bottom - viewHeight + margin;
  return Math.max(0, target);
}

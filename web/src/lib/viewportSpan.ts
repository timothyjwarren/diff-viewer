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

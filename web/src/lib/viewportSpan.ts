export interface FileRect {
  id: string;
  /** Top and bottom edges, relative to the scroll viewport's top edge. */
  top: number;
  bottom: number;
}

/**
 * The run of files currently on screen: the first and last visible files,
 * and how far through each the viewport's top and bottom edges fall (0 = the
 * file's top, 1 = its bottom). Drives the sidebar's viewport indicator.
 */
export interface ViewportSpan {
  startId: string;
  startFraction: number;
  endId: string;
  endFraction: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** `files` must be in document order. */
export function computeViewportSpan(files: FileRect[], viewportHeight: number): ViewportSpan | null {
  const visible = files.filter(f => f.bottom > 0 && f.top < viewportHeight);
  if (visible.length === 0) return null;
  const first = visible[0];
  const last = visible[visible.length - 1];
  return {
    startId: first.id,
    startFraction: clamp01(-first.top / (first.bottom - first.top)),
    endId: last.id,
    endFraction: clamp01((viewportHeight - last.top) / (last.bottom - last.top)),
  };
}

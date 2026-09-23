export interface AnchorEntry {
  id: string;
  top: number;
  isIntersecting: boolean;
}

/**
 * Picks which file-anchor should be highlighted as "currently being viewed"
 * in the sidebar: the last intersecting entry whose top has scrolled to or
 * past the viewport's top edge, or — if every intersecting entry is still
 * below it (e.g. only the very first file is partially visible) — the one
 * nearest to it.
 */
export function pickActiveEntry(entries: AnchorEntry[]): string | null {
  const visible = entries.filter(e => e.isIntersecting);
  if (visible.length === 0) return null;
  const sorted = [...visible].sort((a, b) => a.top - b.top);
  const atOrAboveTop = sorted.filter(e => e.top <= 0);
  return (atOrAboveTop.at(-1) ?? sorted[0]).id;
}

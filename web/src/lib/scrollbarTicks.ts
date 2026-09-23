/**
 * Where to draw a comment's tick on a scrollbar, as a fraction of the track
 * (0 = top, 1 = bottom), so it lines up with the scrollbar thumb.
 *
 * The thumb is `clientHeight / scrollHeight` of the track but never shorter
 * than `minThumb`, and a stretched thumb covers more than one screen of
 * content, so no single tick position can enter and leave the thumb exactly
 * as its comment enters and leaves the screen. Instead the tick sits where
 * the thumb's center is when the comment is centered on screen. When the
 * comment can't be centered (near either end of the content), the tick sits
 * as far down the thumb as the comment sits down the screen. With an
 * unstretched thumb this reduces to `contentCenter / scrollHeight`.
 *
 * Assumes the track runs the full `clientHeight` (no arrow buttons).
 */
export function tickFraction({ contentCenter, scrollHeight, clientHeight, minThumb }: {
  /** The comment's vertical center, measured from the top of the scroll content. */
  contentCenter: number;
  scrollHeight: number;
  clientHeight: number;
  minThumb: number;
}): number {
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0 || clientHeight <= 0) return contentCenter / scrollHeight;

  const track = clientHeight;
  const thumb = Math.min(track, Math.max(minThumb, (track * clientHeight) / scrollHeight));
  const scrollTop = Math.min(maxScroll, Math.max(0, contentCenter - clientHeight / 2));
  const thumbTop = (scrollTop / maxScroll) * (track - thumb);
  const withinScreen = (contentCenter - scrollTop) / clientHeight;
  return (thumbTop + withinScreen * thumb) / track;
}

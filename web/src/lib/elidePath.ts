const ELLIPSIS = "…";

/**
 * Shortens a file's directory so `dir + base` fits, eliding middle
 * directories first so the filename and its nearest directories stay
 * readable: `foo/bar/baz/src/` → `foo/…/baz/src/` → `foo/…/src/` →
 * `foo/…/` → `…/` → "". Returns the directory with a trailing slash (or ""),
 * ready to render before `base`.
 */
export function elideDir(dir: string, base: string, fits: (text: string) => boolean): string {
  if (!dir) return "";
  const full = `${dir}/`;
  const parts = dir.split("/");
  const [first] = parts;

  const candidates = [full];
  for (let keep = parts.length - 2; keep >= 1; keep--) {
    candidates.push(`${first}/${ELLIPSIS}/${parts.slice(-keep).join("/")}/`);
  }
  if (parts.length >= 2) candidates.push(`${first}/${ELLIPSIS}/`);
  candidates.push(`${ELLIPSIS}/`);

  const usable = candidates.filter((c, i) => i === 0 || c.length < full.length);
  return usable.find(c => fits(c + base)) ?? "";
}

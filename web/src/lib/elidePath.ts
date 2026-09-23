const ELLIPSIS = "…";

/**
 * Shortens a file's directory so `dir + base` fits by eliding directories
 * from the middle outward, always keeping the root directory:
 * `foo/bar/baz/src/` → `foo/bar/…/src/` → `foo/…/src/` → `foo/…/`. When a
 * run of directories is removed, an odd leftover is kept on the filename's
 * side. If nothing fits, returns the shortest form (`root/…/`). Returns the
 * directory with a trailing slash (or ""), ready to render before `base`.
 */
export function elideDir(dir: string, base: string, fits: (text: string) => boolean): string {
  if (!dir) return "";
  const [root, ...rest] = dir.split("/");

  const candidates = [`${dir}/`];
  for (let kept = rest.length - 1; kept >= 0; kept--) {
    const left = rest.slice(0, Math.floor(kept / 2));
    const right = rest.slice(rest.length - Math.ceil(kept / 2));
    candidates.push([root, ...left, ELLIPSIS, ...right].join("/") + "/");
  }

  return candidates.find(c => fits(c + base)) ?? candidates[candidates.length - 1];
}

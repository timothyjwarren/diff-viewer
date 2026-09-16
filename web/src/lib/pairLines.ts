import type { DiffLine } from "../types";

export interface PairedRow {
  old: DiffLine | null;
  new: DiffLine | null;
}

/**
 * Pairs a hunk's flat line list into side-by-side rows so the old/new panes
 * stay row-aligned even when an add/del run is unbalanced (e.g. 3 deletions
 * replaced by 1 addition) — the shorter side gets a null placeholder row.
 */
export function pairHunkLines(lines: DiffLine[]): PairedRow[] {
  const rows: PairedRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const current = lines[i];
    if (current.type === "context") {
      rows.push({ old: current, new: current });
      i++;
      continue;
    }

    const dels: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "del") {
      dels.push(lines[i]);
      i++;
    }
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "add") {
      adds.push(lines[i]);
      i++;
    }

    const max = Math.max(dels.length, adds.length);
    for (let k = 0; k < max; k++) {
      rows.push({ old: dels[k] ?? null, new: adds[k] ?? null });
    }
  }
  return rows;
}

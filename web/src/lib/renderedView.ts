import type { CommentThread, DiffHunk } from "../types";
import { shiftForUncommitted } from "./uncommittedShift";

export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

/** Source line numbers that changed on `side`: deleted lines on "old", added lines on "new". */
export function changedLines(hunks: DiffHunk[], side: "old" | "new"): number[] {
  const out: number[] = [];
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (side === "old" && line.type === "del" && line.oldLineNumber != null) out.push(line.oldLineNumber);
      if (side === "new" && line.type === "add" && line.newLineNumber != null) out.push(line.newLineNumber);
    }
  }
  return out;
}

/** One marker per thread on `side`, at the line it displays on in this view. */
export function markersFor(
  threads: CommentThread[], hunks: DiffHunk[], side: "old" | "new",
): { threadId: string; line: number }[] {
  return threads
    .filter(t => t.side === side)
    .map(t => ({ threadId: t.id, line: side === "new" ? shiftForUncommitted(hunks, t.lineEnd) : t.lineEnd }));
}

/** An element's box in the preview document's coordinates. */
export interface PreviewRect { top: number; left: number; width: number; height: number }

export type BridgeMessage =
  | { type: "dv-click"; line: number; rect: PreviewRect }
  | { type: "dv-marker-click"; threadId: string; rect: PreviewRect }
  | { type: "dv-height"; height: number };

function parseRect(value: unknown): PreviewRect | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  const { top, left, width, height } = r;
  if (![top, left, width, height].every(n => typeof n === "number" && Number.isFinite(n))) return null;
  return { top: top as number, left: left as number, width: width as number, height: height as number };
}

export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.type === "dv-height") {
    return typeof m.height === "number" && Number.isFinite(m.height) && m.height > 0 ? { type: "dv-height", height: m.height } : null;
  }
  const rect = parseRect(m.rect);
  if (!rect) return null;
  if (m.type === "dv-click" && typeof m.line === "number") return { type: "dv-click", line: m.line, rect };
  if (m.type === "dv-marker-click" && typeof m.threadId === "string") return { type: "dv-marker-click", threadId: m.threadId, rect };
  return null;
}

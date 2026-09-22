import type { DiffHunk } from "../types";

/**
 * Maps a thread's canonical (HEAD-relative, committed-only) "new"-side line
 * number to where it should actually display in a diff view that also
 * includes uncommitted changes — walking the file's hunks and pushing the
 * position down by however many uncommitted-only lines appear before it.
 *
 * `hunks` must be per-line-flagged via the server's markUncommittedLines
 * (each "add" line that exists only in the working tree, not at HEAD, has
 * `uncommitted: true`). When a file has no such lines, this is a no-op.
 *
 * Known limitation: only accounts for uncommitted insertions, not
 * uncommitted deletions before the line (those aren't currently flagged in
 * the diff data), so a thread past an uncommitted deletion may display one
 * line low until that deletion is committed.
 */
export function shiftForUncommitted(hunks: DiffHunk[], committedLine: number): number {
  let offset = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "del" || line.newLineNumber == null) continue;
      if (line.uncommitted) {
        offset += 1;
        continue;
      }
      const thisCommittedLine = line.newLineNumber - offset;
      if (thisCommittedLine >= committedLine) return committedLine + offset;
    }
  }
  return committedLine + offset;
}

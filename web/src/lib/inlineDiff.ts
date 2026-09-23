export type Range = [start: number, end: number];

export interface InlineChanges {
  old: Range[];
  new: Range[];
}

/** Lines with more tokens than this aren't compared (the LCS table is tokens²). */
const MAX_TOKENS = 500;

/** Below this share of unchanged characters, lines count as rewritten, not edited. */
const MIN_SIMILARITY = 0.4;

const TOKEN_RE = /\w+|\s+|[^\w\s]/g;

interface Token { text: string; start: number; }

function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(TOKEN_RE), m => ({ text: m[0], start: m.index }));
}

/** Marks which tokens of each side belong to their longest common subsequence. */
function commonTokens(a: Token[], b: Token[]): [boolean[], boolean[]] {
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i].text === b[j].text
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const inA = new Array<boolean>(a.length).fill(false);
  const inB = new Array<boolean>(b.length).fill(false);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].text === b[j].text) { inA[i++] = true; inB[j++] = true; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return [inA, inB];
}

/**
 * Character ranges of the tokens not in the common subsequence. Changes
 * separated only by unchanged whitespace are joined into one range.
 */
function changedRanges(text: string, tokens: Token[], common: boolean[]): Range[] {
  const ranges: Range[] = [];
  tokens.forEach((token, k) => {
    if (common[k]) return;
    const end = token.start + token.text.length;
    const last = ranges[ranges.length - 1];
    if (last && /^\s*$/.test(text.slice(last[1], token.start))) last[1] = end;
    else ranges.push([token.start, end]);
  });
  return ranges;
}

/** Characters outside whitespace, optionally counting only common tokens. */
function visibleLength(tokens: Token[], common?: boolean[]): number {
  return tokens.reduce((n, t, k) => n + (common && !common[k] ? 0 : t.text.trim().length), 0);
}

/**
 * The parts of a changed line pair that actually differ, as character
 * ranges into each side, compared word by word. Null when the lines are
 * identical, too long to compare, or too different for a word-level
 * comparison to mean anything.
 */
export function inlineChanges(oldText: string, newText: string): InlineChanges | null {
  if (oldText === newText) return null;
  const a = tokenize(oldText);
  const b = tokenize(newText);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null;
  const [inA, inB] = commonTokens(a, b);
  const longest = Math.max(visibleLength(a), visibleLength(b));
  if (longest > 0 && visibleLength(a, inA) / longest < MIN_SIMILARITY) return null;
  return { old: changedRanges(oldText, a, inA), new: changedRanges(newText, b, inB) };
}

/**
 * House style for every user-facing string and every bot answer:
 * Swiss spelling (ss instead of ß) and no dashes used as punctuation.
 * Hyphens inside words ("KI-Version", "2024-05-01") are fine.
 */

/** En dash, em dash, figure dash, horizontal bar. */
const DASH_CHARS = "‒–—―";

/**
 * A dash used as punctuation, with its surrounding spaces:
 * a typographic dash, a double hyphen, or a single hyphen with whitespace on both sides
 * (which also covers markdown-style "- " bullets at the start of a line).
 */
export const DASH_PUNCTUATION = new RegExp(
  `[ \\t]*(?:[${DASH_CHARS}]|-{2,}|(?<=^|\\s)-(?=[ \\t]))[ \\t]*`,
  "gm",
);

export interface StyleViolation {
  index: number;
  match: string;
  rule: "dash" | "eszett";
}

/**
 * Finds house-style violations in prose. Markdown list bullets at the start of a
 * line are allowed because they are list syntax, not punctuation.
 */
export function findStyleViolations(text: string): StyleViolation[] {
  const violations: StyleViolation[] = [];
  for (const match of text.matchAll(DASH_PUNCTUATION)) {
    const index = match.index;
    const lineStart = index === 0 || text[index - 1] === "\n";
    const isBullet = lineStart && /^[ \t]*-[ \t]/.test(match[0]);
    if (!isBullet) violations.push({ index, match: match[0], rule: "dash" });
  }
  for (const match of text.matchAll(/ß/g)) {
    violations.push({ index: match.index, match: match[0], rule: "eszett" });
  }
  return violations;
}

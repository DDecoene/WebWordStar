import type { TextDocument, Position } from "./types";

/** Ruler fields needed for wrapping/reflow (avoids importing the whole reducer). */
export interface WrapRuler {
  left: number;
  right: number;
  justify: boolean;
}

/** Control characters that are zero-width for margin math. */
export const ZERO_WIDTH = /[\x02\x04\x13\x14\x16\x18\x19]/;

/** Display width of text: character count minus zero-width control characters. */
export function displayWidth(text: string): number {
  const zeroWidthMatches = text.match(new RegExp(ZERO_WIDTH.source, "g"));
  return text.length - (zeroWidthMatches ? zeroWidthMatches.length : 0);
}

/**
 * Find the character index at which to break `line` for wrapping, given a right
 * margin column `right` (0-based last usable column) and left margin `left`
 * (used only as a fallback reference; the line already contains any left padding).
 *
 * Returns null if the line already fits (display width <= right + 1).
 * Otherwise returns the index just after the last breakable space (a literal " ",
 * not the non-breaking-space marker) whose preceding content fits within display
 * column `right`. If there is no such space, returns the character index whose
 * display column is right + 1 (break mid-word at the margin).
 */
export function wrapPoint(line: string, right: number, left: number): number | null {
  const maxWidth = right + 1;
  if (displayWidth(line) <= maxWidth) return null;

  // Walk the line tracking display column; remember the index just after the
  // last breakable space seen while still within the limit.
  let col = 0;
  let lastBreak: number | null = null;
  let overflowIndex: number | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    const isZeroWidth = ZERO_WIDTH.test(ch);
    if (!isZeroWidth) {
      if (col <= maxWidth - 1 && ch === " ") {
        lastBreak = i + 1;
      }
      if (overflowIndex === null && col === maxWidth) {
        overflowIndex = i;
      }
      col++;
    }
  }
  if (lastBreak !== null) return lastBreak;
  if (overflowIndex !== null) return overflowIndex;
  void left;
  return line.length;
}

/**
 * Join the paragraph starting at `fromLine` (through the next hard return, inclusive)
 * into a single string, then greedily re-wrap it into lines at the ruler's margins.
 * Maps `track` (a position inside the paragraph) through the reflow by character offset.
 */
export function reflowParagraph(
  doc: TextDocument,
  fromLine: number,
  ruler: WrapRuler,
  track: Position,
  endLineClamp?: number,
): { document: TextDocument; position: Position } {
  const { left, right, justify } = ruler;

  // Find the end of the paragraph: the first line (from fromLine) whose return is "hard".
  let endLine = fromLine;
  while (endLine < doc.lines.length - 1 && doc.returns[endLine] !== "hard") endLine++;
  // endLine's return is "hard" (or it's the last line of the document).
  if (endLineClamp !== undefined && endLineClamp < endLine) endLine = Math.max(fromLine, endLineClamp);

  const pieces = doc.lines.slice(fromLine, endLine + 1);

  // Compute track's absolute character offset within the joined text (join char = single space).
  let trackOffset = 0;
  if (track.line >= fromLine && track.line <= endLine) {
    for (let i = fromLine; i < track.line; i++) {
      const stripped = stripLeading(pieces[i - fromLine]!.replace(/\s+$/, ""));
      if (stripped.length > 0) trackOffset += stripped.length + 1;
    }
    const curStripped = pieces[track.line - fromLine]!;
    const leadingStripLen = curStripped.length - stripLeading(curStripped).length;
    trackOffset += Math.max(0, track.col - leadingStripLen);
  }

  // Build the joined text (trim trailing spaces per piece, strip leading spaces, skip empties).
  let joined = "";
  for (let i = 0; i < pieces.length; i++) {
    const trimmed = stripLeading(pieces[i]!.replace(/\s+$/, ""));
    if (trimmed.length === 0) continue;
    if (joined.length > 0) joined += " ";
    joined += trimmed;
  }

  // Clamp trackOffset into joined text range.
  trackOffset = Math.max(0, Math.min(trackOffset, joined.length));

  // Greedy word-wrap of `joined` into lines starting with `left` spaces, width <= right+1.
  const indent = " ".repeat(left);
  const maxWidth = right + 1;
  const contentWidth = Math.max(1, maxWidth - left);

  const tokens = joined.length > 0 ? joined.split(" ") : [];
  const outLines: string[] = [];
  const outTokenStarts: number[][] = []; // char offset (into `joined`) of each token's start, per output line
  const outTokens: string[][] = [];

  let curTokens: string[] = [];
  let curStarts: number[] = [];
  let curWidth = 0;
  let pos = 0; // offset into joined
  for (const tok of tokens) {
    const tokStart = pos;
    pos += tok.length + 1; // +1 for the following space (or would-be space)
    const addWidth = curTokens.length === 0 ? tok.length : curWidth + 1 + tok.length;
    if (curTokens.length > 0 && addWidth > contentWidth) {
      outLines.push(curTokens.join(" "));
      outTokenStarts.push(curStarts);
      outTokens.push(curTokens);
      curTokens = [tok];
      curStarts = [tokStart];
      curWidth = tok.length;
    } else {
      curTokens.push(tok);
      curStarts.push(tokStart);
      curWidth = addWidth;
    }
  }
  if (curTokens.length > 0 || outLines.length === 0) {
    outLines.push(curTokens.join(" "));
    outTokenStarts.push(curStarts);
    outTokens.push(curTokens);
  }

  // Map trackOffset -> (outLineIndex, colWithinContent)
  let mappedLine = 0;
  let mappedCol = 0;
  for (let li = 0; li < outTokens.length; li++) {
    const starts = outTokenStarts[li]!;
    const toks = outTokens[li]!;
    const lineStart = starts.length > 0 ? starts[0]! : 0;
    const lineTextLen = toks.join(" ").length;
    const lineEnd = lineStart + lineTextLen;
    if (trackOffset <= lineEnd || li === outTokens.length - 1) {
      mappedLine = li;
      mappedCol = Math.max(0, Math.min(trackOffset - lineStart, lineTextLen));
      break;
    }
  }

  // Apply justification (pad interior gaps) except on the last line.
  const finalLines: string[] = outLines.map((lineText, li) => {
    const isLast = li === outLines.length - 1;
    if (!justify || isLast || outTokens[li]!.length < 2) {
      return indent + lineText;
    }
    const toks = outTokens[li]!;
    const naturalLen = toks.join(" ").length;
    const extra = Math.max(0, contentWidth - naturalLen);
    const gaps = toks.length - 1;
    const base = Math.floor(extra / gaps);
    const remainder = extra % gaps;
    let out = toks[0]!;
    for (let g = 0; g < gaps; g++) {
      const spaces = 1 + base + (g < remainder ? 1 : 0);
      out += " ".repeat(spaces) + toks[g + 1]!;
    }
    return indent + out;
  });

  if (finalLines.length === 0) finalLines.push(indent);

  // Build new document: replace lines [fromLine, endLine] with finalLines.
  const lines = doc.lines.slice();
  const returns = doc.returns.slice();
  const newReturns: ("hard" | "soft")[] = finalLines.map(() => "soft" as const);
  newReturns[newReturns.length - 1] = "hard";
  lines.splice(fromLine, endLine - fromLine + 1, ...finalLines);
  returns.splice(fromLine, endLine - fromLine + 1, ...newReturns);

  const newLine = fromLine + mappedLine;
  const newCol = left + mappedCol;

  return {
    document: { lines, returns },
    position: { line: newLine, col: newCol },
  };
}

function stripLeading(s: string): string {
  return s.replace(/^ +/, "");
}

import type { EditorState } from "./state";
import { orderedBlock } from "./state";

// NOTE: escapes only text-node characters (&, <, >). Does NOT escape quotes, so it must
// NOT be used for HTML attribute values.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type CellClass = "cursor" | "block" | null;

/** Coalesce consecutive cells with the same class into spans; null runs are raw escaped text. */
function cellsToHtml(cells: { ch: string; cls: CellClass }[]): string {
  let out = "";
  let i = 0;
  while (i < cells.length) {
    const cls = cells[i]!.cls;
    let j = i;
    let chunk = "";
    while (j < cells.length && cells[j]!.cls === cls) {
      chunk += cells[j]!.ch;
      j++;
    }
    const escaped = escapeHtml(chunk);
    out += cls ? `<span class="${cls}">${escaped}</span>` : escaped;
    i = j;
  }
  return out;
}

/** Is column `col` on `line` inside the ordered block [start, end)? Multi-line blocks
 *  cover from start.col on the first line to end.col on the last, full lines in between. */
function inBlock(
  block: ReturnType<typeof orderedBlock>,
  line: number,
  col: number,
  lineLen: number,
): boolean {
  if (!block) return false;
  if (line < block.start.line || line > block.end.line) return false;
  const from = line === block.start.line ? block.start.col : 0;
  const to = line === block.end.line ? block.end.col : lineLen;
  return col >= from && col < to;
}

function renderLine(
  text: string,
  line: number,
  cursorLine: number,
  cursorCol: number,
  block: ReturnType<typeof orderedBlock>,
): string {
  // One extra virtual cell at end-of-line so the block cursor has a cell to occupy.
  const length = text.length;
  const cells: { ch: string; cls: CellClass }[] = [];
  for (let col = 0; col <= length; col++) {
    const ch = col < length ? text[col]! : " ";
    let cls: CellClass = null;
    if (inBlock(block, line, col, length)) cls = "block";
    if (line === cursorLine && col === cursorCol) cls = "cursor"; // cursor wins
    if (col === length && cls !== "cursor") continue; // don't emit trailing virtual cell unless it's the cursor
    cells.push({ ch, cls });
  }
  return cellsToHtml(cells);
}

/** Render the full editor (status line + screen) to an HTML string. */
export function renderEditor(state: EditorState): string {
  const { document, cursor, mode, filename } = state;
  const modeLabel = mode === "insert" ? "INSERT" : "OVERTYPE";
  const status = state.prompt
    ? `${state.prompt.label} ${state.prompt.buffer}`
    : `${filename}   PAGE 1 LINE ${cursor.line + 1} COL ${cursor.col + 1}   ${modeLabel}`;
  const block = state.hideBlock ? null : orderedBlock(state);

  const screen = document.lines
    .map((text, i) => renderLine(text, i, cursor.line, cursor.col, block))
    .join("\n");

  return (
    `<div class="status" data-testid="status">${escapeHtml(status)}</div>` +
    `<pre class="screen" data-testid="screen">${screen}</pre>`
  );
}

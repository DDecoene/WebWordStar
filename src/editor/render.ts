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

type CellClass = string | null;

/** Embedded print-control characters: mnemonic letter shown when controls are visible, and the
 *  CSS style class toggled on the text between an opening and matching closing marker. */
const CONTROL_STYLES: Record<string, { mnemonic: string; style: string }> = {
  "\x02": { mnemonic: "B", style: "fmt-bold" },
  "\x13": { mnemonic: "S", style: "fmt-underline" },
  "\x19": { mnemonic: "Y", style: "fmt-italic" },
  "\x04": { mnemonic: "D", style: "fmt-double" },
  "\x18": { mnemonic: "X", style: "fmt-strike" },
  "\x14": { mnemonic: "T", style: "fmt-super" },
  "\x16": { mnemonic: "V", style: "fmt-sub" },
};

/** Non-break space control char: renders as a plain space, no style toggle. */
const NBSP_CONTROL = "\x0F";

function combineClasses(...classes: (string | null)[]): CellClass {
  const parts = classes.filter((c): c is string => !!c);
  return parts.length > 0 ? parts.join(" ") : null;
}

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
  showControls: boolean,
): string {
  // One extra virtual cell at end-of-line so the block cursor has a cell to occupy.
  const length = text.length;
  const cells: { ch: string; cls: CellClass }[] = [];
  const activeStyles = new Set<string>();
  let pendingCursor = false; // cursor sat on a marker char that hidden mode skipped; land on next visible cell

  for (let col = 0; col <= length; col++) {
    const isVirtual = col === length;
    const ch = isVirtual ? " " : text[col]!;
    const isCursorHere = line === cursorLine && col === cursorCol;
    const meta = !isVirtual ? CONTROL_STYLES[ch] : undefined;

    if (!isVirtual && ch === NBSP_CONTROL) {
      const styleCls = activeStyles.size > 0 ? [...activeStyles].join(" ") : null;
      const isCursor = isCursorHere || pendingCursor;
      const blockCls = !isCursor && inBlock(block, line, col, length) ? "block" : null;
      pendingCursor = false;
      cells.push({ ch: " ", cls: combineClasses(styleCls, blockCls, isCursor ? "cursor" : null) });
      continue;
    }

    if (!isVirtual && meta) {
      if (activeStyles.has(meta.style)) activeStyles.delete(meta.style);
      else activeStyles.add(meta.style);

      if (showControls) {
        const isCursor = isCursorHere || pendingCursor;
        const blockCls = !isCursor && inBlock(block, line, col, length) ? "block" : null;
        pendingCursor = false;
        cells.push({ ch: meta.mnemonic, cls: combineClasses("ctrl", blockCls, isCursor ? "cursor" : null) });
      } else if (isCursorHere) {
        pendingCursor = true;
      }
      continue;
    }

    const isCursor = isCursorHere || pendingCursor;
    const styleCls = activeStyles.size > 0 ? [...activeStyles].join(" ") : null;
    const blockCls = !isCursor && inBlock(block, line, col, length) ? "block" : null;
    const cls = combineClasses(styleCls, blockCls, isCursor ? "cursor" : null);
    if (isVirtual && !isCursor) continue; // don't emit trailing virtual cell unless it's the cursor
    pendingCursor = false;
    cells.push({ ch, cls });
  }
  return cellsToHtml(cells);
}

/** Build the ruler row: L at ruler.left, R at ruler.right, ! at tab stops, - elsewhere. */
function renderRuler(ruler: EditorState["ruler"]): string {
  const cells: string[] = [];
  for (let col = 0; col <= ruler.right; col++) {
    if (col === ruler.left) cells.push("L");
    else if (col === ruler.right) cells.push("R");
    else if (ruler.tabs.includes(col)) cells.push("!");
    else cells.push("-");
  }
  return escapeHtml(cells.join(""));
}

/** Render the full editor (status line + screen) to an HTML string. */
export function renderEditor(state: EditorState): string {
  const { document, cursor, mode, filename } = state;
  const modeLabel = mode === "insert" ? "INSERT" : "OVERTYPE";

  // When a prompt is active, the status bar becomes an editable command line with
  // a visible block caret after the typed text. Otherwise it is the normal status line.
  let statusHtml: string;
  if (state.prompt) {
    statusHtml =
      `${escapeHtml(state.prompt.label)} ${escapeHtml(state.prompt.buffer)}` +
      `<span class="cursor"> </span>`;
  } else {
    statusHtml = escapeHtml(
      `${filename}   PAGE 1 LINE ${cursor.line + 1} COL ${cursor.col + 1}   ${modeLabel}`,
    );
  }

  const block = state.hideBlock ? null : orderedBlock(state);

  // While a prompt is active the caret lives in the command line, so the document
  // cursor is suppressed (line -1 never matches a row) to avoid two blinking carets.
  const cursorLine = state.prompt ? -1 : cursor.line;

  const screen = document.lines
    .map((text, i) => {
      const lineHtml = renderLine(text, i, cursorLine, cursor.col, block, state.showControls);
      const isHard = document.returns[i] === "hard";
      const flagChar = escapeHtml(isHard ? "<" : " ");
      return `${lineHtml}<span class="flag">${flagChar}</span>`;
    })
    .join("\n");

  const rulerHtml = state.ruler.showRuler
    ? `<div class="ruler" data-testid="ruler">${renderRuler(state.ruler)}</div>`
    : "";

  return (
    `<div class="status" data-testid="status">${statusHtml}</div>` +
    rulerHtml +
    `<pre class="screen" data-testid="screen">${screen}</pre>`
  );
}

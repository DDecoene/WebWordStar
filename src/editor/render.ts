import type { EditorState } from "./state";

// NOTE: escapes only text-node characters (&, <, >). Does NOT escape quotes, so it must
// NOT be used for HTML attribute values.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render a single line, wrapping the cursor cell in a <span> if the cursor is on this line. */
function renderLine(text: string, line: number, cursorLine: number, cursorCol: number): string {
  if (line !== cursorLine) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, cursorCol));
  const cellChar = cursorCol < text.length ? text[cursorCol]! : " ";
  const after = cursorCol < text.length ? escapeHtml(text.slice(cursorCol + 1)) : "";
  return `${before}<span class="cursor">${escapeHtml(cellChar)}</span>${after}`;
}

/** Render the full editor (status line + screen) to an HTML string. */
export function renderEditor(state: EditorState): string {
  const { document, cursor, mode, filename } = state;
  const modeLabel = mode === "insert" ? "INSERT" : "OVERTYPE";
  const status =
    `${filename}   PAGE 1 LINE ${cursor.line + 1} COL ${cursor.col + 1}   ${modeLabel}`;

  const screen = document.lines
    .map((text, i) => renderLine(text, i, cursor.line, cursor.col))
    .join("\n");

  return (
    `<div class="status" data-testid="status">${escapeHtml(status)}</div>` +
    `<pre class="screen" data-testid="screen">${screen}</pre>`
  );
}

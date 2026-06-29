import type { Position, TextDocument } from "../shared/types";
import { createDocument, insertText, deleteRange, splitLine } from "../shared/document";

export type EditorMode = "insert" | "overtype";
export type Pending = null | "quick" | "block"; // ^Q quick, ^K block

export interface EditorState {
  document: TextDocument;
  cursor: Position;
  mode: EditorMode;
  pending: Pending;
  filename: string;
  blockStart: Position | null;
  blockEnd: Position | null;
  hideBlock: boolean;
}

export interface KeyEvent {
  key: string;
  ctrl: boolean;
}

export function createEditorState(text = "", filename = "UNTITLED"): EditorState {
  return {
    document: createDocument(text),
    cursor: { line: 0, col: 0 },
    mode: "insert",
    pending: null,
    filename,
    blockStart: null,
    blockEnd: null,
    hideBlock: false,
  };
}

export function lineLength(doc: TextDocument, line: number): number {
  return (doc.lines[line] ?? "").length;
}

export function clampCursor(doc: TextDocument, pos: Position): Position {
  const line = Math.max(0, Math.min(pos.line, doc.lines.length - 1));
  const col = Math.max(0, Math.min(pos.col, lineLength(doc, line)));
  return { line, col };
}

/** True for a single printable character (length-1, not a named key like "Enter"). */
function isPrintable(ev: KeyEvent): boolean {
  return !ev.ctrl && ev.key.length === 1;
}

export function applyKey(state: EditorState, ev: KeyEvent): EditorState {
  // If a prefix is pending, this key completes the command.
  if (state.pending === "quick") {
    return resolveQuick({ ...state, pending: null }, ev.key.toLowerCase());
  }
  if (state.pending === "block") {
    return resolveBlock({ ...state, pending: null }, ev.key.toLowerCase());
  }

  // ^Q — begin a quick-movement prefix
  if (ev.ctrl && ev.key.toLowerCase() === "q") {
    return { ...state, pending: "quick" };
  }

  // ^K — begin a block command prefix
  if (ev.ctrl && ev.key.toLowerCase() === "k") {
    return { ...state, pending: "block" };
  }

  // ^V — toggle insert/overtype
  if (ev.ctrl && ev.key.toLowerCase() === "v") {
    return { ...state, mode: state.mode === "insert" ? "overtype" : "insert" };
  }

  if (!ev.ctrl && ev.key === "Enter") {
    const doc = splitLine(state.document, state.cursor);
    return { ...state, document: doc, cursor: { line: state.cursor.line + 1, col: 0 } };
  }

  if (!ev.ctrl && ev.key === "Backspace") {
    return backspace(state);
  }

  if (ev.ctrl && ev.key.toLowerCase() === "g") {
    return deleteForward(state);
  }

  if (ev.ctrl) {
    const moved = moveDiamond(state, ev.key.toLowerCase());
    if (moved) return moved;
  }

  if (isPrintable(ev)) {
    return typeChar(state, ev.key);
  }

  return state;
}

function typeChar(state: EditorState, ch: string): EditorState {
  const { document, cursor, mode } = state;
  const atEndOfLine = cursor.col >= lineLength(document, cursor.line);
  let doc = document;
  if (mode === "overtype" && !atEndOfLine) {
    doc = deleteRange(doc, cursor, { line: cursor.line, col: cursor.col + 1 });
  }
  doc = insertText(doc, cursor, ch);
  return { ...state, document: doc, cursor: { line: cursor.line, col: cursor.col + 1 } };
}

function backspace(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (cursor.col > 0) {
    const doc = deleteRange(document, { line: cursor.line, col: cursor.col - 1 }, cursor);
    return { ...state, document: doc, cursor: { line: cursor.line, col: cursor.col - 1 } };
  }
  if (cursor.line > 0) {
    const prevLen = lineLength(document, cursor.line - 1);
    const doc = deleteRange(document, { line: cursor.line - 1, col: prevLen }, { line: cursor.line, col: 0 });
    return { ...state, document: doc, cursor: { line: cursor.line - 1, col: prevLen } };
  }
  return state;
}

function deleteForward(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (cursor.col < lineLength(document, cursor.line)) {
    const doc = deleteRange(document, cursor, { line: cursor.line, col: cursor.col + 1 });
    return { ...state, document: doc };
  }
  if (cursor.line < document.lines.length - 1) {
    const doc = deleteRange(document, cursor, { line: cursor.line + 1, col: 0 });
    return { ...state, document: doc };
  }
  return state;
}

/** Character-level cursor moves for ^E/^X/^S/^D. Returns null if the key isn't a move. */
function moveDiamond(state: EditorState, key: string): EditorState | null {
  const { document, cursor } = state;
  switch (key) {
    case "e": // up
      return { ...state, cursor: clampCursor(document, { line: cursor.line - 1, col: cursor.col }) };
    case "x": // down
      return { ...state, cursor: clampCursor(document, { line: cursor.line + 1, col: cursor.col }) };
    case "s": { // left, wrapping
      if (cursor.col > 0) return { ...state, cursor: { line: cursor.line, col: cursor.col - 1 } };
      if (cursor.line > 0)
        return { ...state, cursor: { line: cursor.line - 1, col: lineLength(document, cursor.line - 1) } };
      return state;
    }
    case "d": { // right, wrapping
      if (cursor.col < lineLength(document, cursor.line))
        return { ...state, cursor: { line: cursor.line, col: cursor.col + 1 } };
      if (cursor.line < document.lines.length - 1)
        return { ...state, cursor: { line: cursor.line + 1, col: 0 } };
      return state;
    }
    case "f":
      return { ...state, cursor: nextWord(document, cursor) };
    case "a":
      return { ...state, cursor: prevWord(document, cursor) };
    default:
      return null;
  }
}

/** Resolve the second key of a ^Q quick command. Unknown keys just clear the prefix.
 * Classic WordStar behavior: the second key may arrive with or without ctrl held — both are accepted.
 * (The caller already lowercases `key` via ev.key.toLowerCase().)
 */
function resolveQuick(state: EditorState, key: string): EditorState {
  const { document, cursor } = state;
  switch (key) {
    case "s": // start of line
      return { ...state, cursor: { line: cursor.line, col: 0 } };
    case "d": // end of line
      return { ...state, cursor: { line: cursor.line, col: lineLength(document, cursor.line) } };
    case "e": // top of screen (document, until scrolling exists)
      return { ...state, cursor: { line: 0, col: 0 } };
    case "x": // bottom of screen (document, until scrolling exists)
      return { ...state, cursor: clampCursor(document, { line: document.lines.length - 1, col: cursor.col }) };
    case "r": // start of document
      return { ...state, cursor: { line: 0, col: 0 } };
    case "c": { // end of document
      const last = document.lines.length - 1;
      return { ...state, cursor: { line: last, col: lineLength(document, last) } };
    }
    default:
      return state; // prefix already cleared by caller
  }
}

/** Return the block markers sorted into document order, or null if either is unset. */
export function orderedBlock(state: EditorState): { start: Position; end: Position } | null {
  const { blockStart, blockEnd } = state;
  if (!blockStart || !blockEnd) return null;
  const aFirst =
    blockStart.line < blockEnd.line ||
    (blockStart.line === blockEnd.line && blockStart.col <= blockEnd.col);
  return aFirst ? { start: blockStart, end: blockEnd } : { start: blockEnd, end: blockStart };
}

/** Resolve the second key of a ^K block command. Unknown keys just clear the prefix. */
function resolveBlock(state: EditorState, key: string): EditorState {
  switch (key) {
    case "b":
      return { ...state, blockStart: state.cursor };
    case "k":
      return { ...state, blockEnd: state.cursor };
    case "h":
      return { ...state, hideBlock: !state.hideBlock };
    default:
      return state; // prefix already cleared by caller
  }
}

// TODO: Unicode-aware word boundaries (currently ASCII-only via \w)
const WORD = /\w/;

/** Start of the next word (or next line if past the last word). */
function nextWord(doc: TextDocument, pos: Position): Position {
  const line = doc.lines[pos.line] ?? "";
  let c = pos.col;
  while (c < line.length && WORD.test(line[c]!)) c++; // skip current word
  while (c < line.length && !WORD.test(line[c]!)) c++; // skip gap
  if (c >= line.length && pos.line < doc.lines.length - 1) return { line: pos.line + 1, col: 0 };
  return { line: pos.line, col: c };
}

/** Start of the current word, or the previous word if already at a word start. */
function prevWord(doc: TextDocument, pos: Position): Position {
  const line = doc.lines[pos.line] ?? "";
  let c = pos.col;
  while (c > 0 && !WORD.test(line[c - 1]!)) c--; // skip gap to the left
  while (c > 0 && WORD.test(line[c - 1]!)) c--; // skip to word start
  return { line: pos.line, col: c };
}

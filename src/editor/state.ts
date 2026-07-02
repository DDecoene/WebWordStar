import type { Position, TextDocument } from "../shared/types";
import { createDocument, insertText, deleteRange, splitLine, getRange, insertMultiline } from "../shared/document";
import { displayWidth, wrapPoint, reflowParagraph } from "../shared/wrap";

export type EditorMode = "insert" | "overtype";
export type Pending = null | "quick" | "block" | "onscreen"; // ^Q quick, ^K block, ^O onscreen format
export type EditKind = "type" | "backspace";
export type PromptTarget = "filename" | "leftMargin" | "rightMargin" | "spacing";

export interface HistorySnapshot {
  document: TextDocument;
  cursor: Position;
}

export interface Ruler {
  left: number;
  right: number;
  tabs: number[];
  spacing: number;
  justify: boolean;
  wordWrap: boolean;
  showRuler: boolean;
}

export function createRuler(): Ruler {
  const tabs: number[] = [];
  for (let c = 5; c <= 60; c += 5) tabs.push(c);
  return { left: 0, right: 65, tabs, spacing: 1, justify: false, wordWrap: true, showRuler: true };
}

export interface EditorState {
  document: TextDocument;
  cursor: Position;
  mode: EditorMode;
  pending: Pending;
  filename: string;
  blockStart: Position | null;
  blockEnd: Position | null;
  hideBlock: boolean;
  prompt: { label: string; buffer: string; target: PromptTarget } | null;
  history: { undo: HistorySnapshot[]; redo: HistorySnapshot[] };
  lastEdit: EditKind | null;
  ruler: Ruler;
  showControls: boolean;
  marginRelease: boolean;
  tempIndent: number | null;
}

export interface KeyEvent {
  key: string;
  ctrl: boolean;
}

const UNDO_LIMIT = 200;

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
    prompt: null,
    history: { undo: [], redo: [] },
    lastEdit: null,
    ruler: createRuler(),
    showControls: true,
    marginRelease: false,
    tempIndent: null,
  };
}

/** Seal the current undo chunk (movement, mode toggle, prefixes): just clear the coalescing marker. */
function sealChunk(state: EditorState): EditorState {
  return state.lastEdit === null ? state : { ...state, lastEdit: null };
}

/**
 * Record the pre-mutation snapshot before an edit of `kind`. Consecutive edits of the
 * same coalescable kind ("type"/"backspace") share one undo step; any other kind (or a
 * change of kind) pushes a fresh snapshot and clears the redo stack.
 */
function remember(state: EditorState, kind: EditKind | null): EditorState {
  if (kind !== null && kind === state.lastEdit) return state;
  const snapshot: HistorySnapshot = { document: state.document, cursor: state.cursor };
  const undo = [...state.history.undo, snapshot].slice(-UNDO_LIMIT);
  return { ...state, history: { undo, redo: [] }, lastEdit: kind };
}

function undo(state: EditorState): EditorState {
  const { undo: undoStack, redo: redoStack } = state.history;
  if (undoStack.length === 0) return state;
  const snapshot = undoStack[undoStack.length - 1]!;
  const current: HistorySnapshot = { document: state.document, cursor: state.cursor };
  return {
    ...state,
    document: snapshot.document,
    cursor: snapshot.cursor,
    history: { undo: undoStack.slice(0, -1), redo: [...redoStack, current] },
    lastEdit: null,
  };
}

function redo(state: EditorState): EditorState {
  const { undo: undoStack, redo: redoStack } = state.history;
  if (redoStack.length === 0) return state;
  const snapshot = redoStack[redoStack.length - 1]!;
  const current: HistorySnapshot = { document: state.document, cursor: state.cursor };
  return {
    ...state,
    document: snapshot.document,
    cursor: snapshot.cursor,
    history: { undo: [...undoStack, current], redo: redoStack.slice(0, -1) },
    lastEdit: null,
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
  if (state.prompt) {
    return applyPromptKey(state, ev);
  }
  // If a prefix is pending, this key completes the command.
  if (state.pending === "quick") {
    return resolveQuick({ ...state, pending: null }, ev.key.toLowerCase());
  }
  if (state.pending === "block") {
    return resolveBlock({ ...state, pending: null }, ev.key.toLowerCase());
  }
  if (state.pending === "onscreen") {
    return resolveOnscreen({ ...state, pending: null }, ev.key.toLowerCase());
  }

  // ^Q — begin a quick-movement prefix
  if (ev.ctrl && ev.key.toLowerCase() === "q") {
    return { ...sealChunk(state), pending: "quick" };
  }

  // ^K — begin a block command prefix
  if (ev.ctrl && ev.key.toLowerCase() === "k") {
    return { ...sealChunk(state), pending: "block" };
  }

  // ^O — begin an onscreen-format command prefix
  if (ev.ctrl && ev.key.toLowerCase() === "o") {
    return { ...sealChunk(state), pending: "onscreen" };
  }

  // ^V — toggle insert/overtype
  if (ev.ctrl && ev.key.toLowerCase() === "v") {
    return { ...sealChunk(state), mode: state.mode === "insert" ? "overtype" : "insert" };
  }

  // ^U — undo
  if (ev.ctrl && ev.key.toLowerCase() === "u") {
    return undo(state);
  }

  // ^B — reflow the current paragraph to the ruler margins
  if (ev.ctrl && ev.key.toLowerCase() === "b") {
    return reflowParagraphAt(state);
  }

  if (!ev.ctrl && ev.key === "Enter") {
    const withHistory = remember(state, null);
    const doc = splitLine(withHistory.document, withHistory.cursor);
    return {
      ...withHistory,
      document: doc,
      cursor: { line: withHistory.cursor.line + 1, col: 0 },
      tempIndent: null,
      marginRelease: false,
    };
  }

  if (!ev.ctrl && ev.key === "Backspace") {
    return backspace(state);
  }

  if (ev.ctrl && ev.key.toLowerCase() === "g") {
    return deleteForward(state);
  }

  if (ev.ctrl) {
    const moved = moveDiamond(sealChunk(state), ev.key.toLowerCase());
    if (moved) return moved;
  }

  // Arrow keys are modern alternates for the diamond's character moves.
  if (!ev.ctrl && ev.key in ARROWS) {
    const moved = moveDiamond(sealChunk(state), ARROWS[ev.key]!);
    if (moved) return moved;
  }

  if (isPrintable(ev)) {
    return typeChar(state, ev.key);
  }

  return sealChunk(state);
}

function typeChar(state: EditorState, ch: string): EditorState {
  const withHistory = remember(state, "type");
  const { document, cursor, mode } = withHistory;
  const atEndOfLine = cursor.col >= lineLength(document, cursor.line);
  let doc = document;
  if (mode === "overtype" && !atEndOfLine) {
    doc = deleteRange(doc, cursor, { line: cursor.line, col: cursor.col + 1 });
  }
  doc = insertText(doc, cursor, ch);
  const newCursor: Position = { line: cursor.line, col: cursor.col + 1 };
  const next = { ...withHistory, document: doc, cursor: newCursor };

  if (!next.ruler.wordWrap || next.marginRelease) return next;

  const line = doc.lines[newCursor.line] ?? "";
  if (displayWidth(line) <= next.ruler.right + 1) return next;

  const breakAt = wrapPoint(line, next.ruler.right, next.ruler.left);
  if (breakAt === null) return next;

  const wasInSpill = newCursor.col > breakAt;
  // Trim a single trailing space at the break point: the space that triggered the
  // break is consumed by the wrap itself, not carried onto either line.
  const trimmedBreak = line[breakAt - 1] === " " ? breakAt - 1 : breakAt;
  const trailingTrim = breakAt - trimmedBreak;
  const splitPos: Position = { line: newCursor.line, col: breakAt };
  let wrappedDoc = splitLine(doc, splitPos, "soft");
  if (trailingTrim > 0) {
    wrappedDoc = deleteRange(
      wrappedDoc,
      { line: newCursor.line, col: trimmedBreak },
      { line: newCursor.line, col: breakAt },
    );
  }
  const indent = " ".repeat(next.tempIndent ?? next.ruler.left);
  const spilled = (wrappedDoc.lines[newCursor.line + 1] ?? "").replace(/^ +/, "");
  wrappedDoc = deleteRange(
    wrappedDoc,
    { line: newCursor.line + 1, col: 0 },
    { line: newCursor.line + 1, col: (wrappedDoc.lines[newCursor.line + 1] ?? "").length },
  );
  wrappedDoc = insertText(wrappedDoc, { line: newCursor.line + 1, col: 0 }, indent + spilled);

  const wrappedCursor: Position = wasInSpill
    ? { line: newCursor.line + 1, col: indent.length + (newCursor.col - breakAt) }
    : newCursor;

  return { ...next, document: wrappedDoc, cursor: wrappedCursor };
}

/** Find the start of the paragraph containing `line` (scan back past soft breaks). */
function paragraphStart(doc: TextDocument, line: number): number {
  let start = line;
  while (start > 0 && doc.returns[start - 1] === "soft") start--;
  return start;
}

function reflowParagraphAt(state: EditorState): EditorState {
  const withHistory = remember(state, null);
  const { document, cursor, ruler } = withHistory;
  const fromLine = paragraphStart(document, cursor.line);
  const { document: reflowed, position } = reflowParagraph(
    document,
    fromLine,
    { left: ruler.left, right: ruler.right, justify: ruler.justify },
    cursor,
  );
  return sealChunk({ ...withHistory, document: reflowed, cursor: position });
}

function backspace(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (cursor.col > 0) {
    const withHistory = remember(state, "backspace");
    const doc = deleteRange(document, { line: cursor.line, col: cursor.col - 1 }, cursor);
    return { ...withHistory, document: doc, cursor: { line: cursor.line, col: cursor.col - 1 } };
  }
  if (cursor.line > 0) {
    const withHistory = remember(state, "backspace");
    const prevLen = lineLength(document, cursor.line - 1);
    const doc = deleteRange(document, { line: cursor.line - 1, col: prevLen }, { line: cursor.line, col: 0 });
    return { ...withHistory, document: doc, cursor: { line: cursor.line - 1, col: prevLen } };
  }
  return state;
}

function deleteForward(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (cursor.col < lineLength(document, cursor.line)) {
    const withHistory = remember(state, null);
    const doc = deleteRange(document, cursor, { line: cursor.line, col: cursor.col + 1 });
    return { ...withHistory, document: doc };
  }
  if (cursor.line < document.lines.length - 1) {
    const withHistory = remember(state, null);
    const doc = deleteRange(document, cursor, { line: cursor.line + 1, col: 0 });
    return { ...withHistory, document: doc };
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
    case "u": // ^Q U — redo
      return redo(state);
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
    case "c":
      return copyBlock(state);
    case "y":
      return deleteBlock(state);
    case "v":
      return moveBlock(state);
    case "n":
      // Start empty; an empty commit keeps the current name (see applyPromptKey).
      return { ...state, prompt: { label: "DOCUMENT NAME:", buffer: "", target: "filename" } };
    default:
      return state; // prefix already cleared by caller
  }
}

/** Resolve the second key of a ^O onscreen-format command. Unknown keys just clear the prefix. */
function resolveOnscreen(state: EditorState, key: string): EditorState {
  const { ruler, cursor } = state;
  switch (key) {
    case "l":
      return { ...state, prompt: { label: "LEFT MARGIN:", buffer: "", target: "leftMargin" } };
    case "r":
      return { ...state, prompt: { label: "RIGHT MARGIN:", buffer: "", target: "rightMargin" } };
    case "s":
      return { ...state, prompt: { label: "LINE SPACING:", buffer: "", target: "spacing" } };
    case "c":
      return centerLine(state);
    case "j":
      return { ...state, ruler: { ...ruler, justify: !ruler.justify } };
    case "w":
      return { ...state, ruler: { ...ruler, wordWrap: !ruler.wordWrap } };
    case "t":
      return { ...state, ruler: { ...ruler, showRuler: !ruler.showRuler } };
    case "d":
      return { ...state, showControls: !state.showControls };
    case "i": {
      if (ruler.tabs.includes(cursor.col)) return state;
      const tabs = [...ruler.tabs, cursor.col].sort((a, b) => a - b);
      return { ...state, ruler: { ...ruler, tabs } };
    }
    case "n": {
      const tabs = ruler.tabs.filter((t) => t !== cursor.col);
      return { ...state, ruler: { ...ruler, tabs } };
    }
    case "x":
      return { ...state, marginRelease: true };
    case "g": {
      const next = ruler.tabs.find((t) => t > ruler.left);
      return { ...state, tempIndent: next ?? ruler.left };
    }
    default:
      return state; // prefix already cleared by caller
  }
}

function centerLine(state: EditorState): EditorState {
  const { document, cursor, ruler } = state;
  const line = document.lines[cursor.line] ?? "";
  const trimmed = line.trim();
  if (trimmed.length === 0) return state;
  const width = ruler.right - ruler.left + 1;
  const col = Math.max(ruler.left, ruler.left + Math.floor((width - trimmed.length) / 2));
  const newLine = " ".repeat(col) + trimmed;
  const withHistory = remember(state, null);
  const doc = deleteRange(withHistory.document, { line: cursor.line, col: 0 }, { line: cursor.line, col: line.length });
  const inserted = insertText(doc, { line: cursor.line, col: 0 }, newLine);
  return { ...withHistory, document: inserted, cursor: { line: cursor.line, col: newLine.length } };
}

function copyBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const withHistory = remember(state, null);
  const text = getRange(withHistory.document, block.start, block.end);
  const { document, end } = insertMultiline(withHistory.document, withHistory.cursor, text);
  return { ...withHistory, document, cursor: end, blockStart: null, blockEnd: null };
}

function deleteBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const withHistory = remember(state, null);
  const document = deleteRange(withHistory.document, block.start, block.end);
  return { ...withHistory, document, cursor: block.start, blockStart: null, blockEnd: null };
}

function isBeforePosition(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.col < b.col);
}

/** True if `pos` lies within [start, end) (inclusive start, exclusive end). */
function isInsideBlock(pos: Position, start: Position, end: Position): boolean {
  return !isBeforePosition(pos, start) && isBeforePosition(pos, end);
}

function moveBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const { start, end } = block;
  const cursor = state.cursor;
  if (isInsideBlock(cursor, start, end)) return state;

  const withHistory = remember(state, null);
  const text = getRange(withHistory.document, start, end);
  const document = deleteRange(withHistory.document, start, end);

  let target: Position;
  if (isBeforePosition(cursor, start)) {
    target = cursor;
  } else if (cursor.line > end.line) {
    target = { line: cursor.line - (end.line - start.line), col: cursor.col };
  } else {
    // cursor.line === end.line && cursor.col >= end.col
    target = { line: start.line, col: start.col + (cursor.col - end.col) };
  }

  const inserted = insertMultiline(document, target, text);
  return {
    ...withHistory,
    document: inserted.document,
    cursor: inserted.end,
    blockStart: null,
    blockEnd: null,
  };
}

// TODO: Unicode-aware word boundaries (currently ASCII-only via \w)
const WORD = /\w/;

/** Arrow-key to diamond-move character mapping (hoisted to avoid re-allocation on every keystroke). */
const ARROWS: Record<string, string> = {
  ArrowUp: "e",
  ArrowDown: "x",
  ArrowLeft: "s",
  ArrowRight: "d",
};

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

/** Handle a keystroke while the title/command prompt is active. */
function applyPromptKey(state: EditorState, ev: KeyEvent): EditorState {
  const prompt = state.prompt!;
  if (!ev.ctrl && ev.key === "Enter") {
    switch (prompt.target) {
      case "filename": {
        const filename = prompt.buffer.length > 0 ? prompt.buffer : state.filename;
        return { ...state, filename, prompt: null };
      }
      case "leftMargin": {
        const val = parseInt(prompt.buffer, 10);
        if (isNaN(val) || val < 1 || val - 1 >= state.ruler.right) return { ...state, prompt: null };
        return { ...state, ruler: { ...state.ruler, left: val - 1 }, prompt: null };
      }
      case "rightMargin": {
        const val = parseInt(prompt.buffer, 10);
        if (isNaN(val) || val < 1 || state.ruler.left >= val - 1) return { ...state, prompt: null };
        return { ...state, ruler: { ...state.ruler, right: val - 1 }, prompt: null };
      }
      case "spacing": {
        const val = parseInt(prompt.buffer, 10);
        if (isNaN(val) || val < 1 || val > 9) return { ...state, prompt: null };
        return { ...state, ruler: { ...state.ruler, spacing: val }, prompt: null };
      }
    }
  }
  if (!ev.ctrl && ev.key === "Escape") {
    return { ...state, prompt: null };
  }
  if (!ev.ctrl && ev.key === "Backspace") {
    return { ...state, prompt: { ...prompt, buffer: prompt.buffer.slice(0, -1) } };
  }
  if (!ev.ctrl && ev.key.length === 1) {
    return { ...state, prompt: { ...prompt, buffer: prompt.buffer + ev.key } };
  }
  return state;
}

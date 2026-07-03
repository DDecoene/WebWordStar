import type { EditIntent, Position, TextDocument } from "../shared/types";
import { createDocument, applyIntent, getRange } from "../shared/document";
import { insertEnd, invertIntents, transformIntents, transformPosition } from "../shared/transform";
import { displayWidth, wrapPoint, reflowParagraph } from "../shared/wrap";
import { isDotLine, scanLayout } from "../shared/dot";

export type EditorMode = "insert" | "overtype";
export type Pending = null | "quick" | "block" | "onscreen" | "print" | "help"; // ^Q quick, ^K block, ^O onscreen format, ^P print controls, ^J help
export type EditKind = "type" | "backspace";
export type PromptTarget = "filename" | "leftMargin" | "rightMargin" | "spacing" | "helpLevel" | "export";

/** One undoable step: the user's own intents and their ready-to-apply inverses. */
export interface HistoryEntry {
  intents: EditIntent[];
  inverses: EditIntent[]; // reversed order: applying them to the post-state restores the pre-state
  cursorBefore: Position;
  cursorAfter: Position;
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
  history: { undo: HistoryEntry[]; redo: HistoryEntry[] };
  lastEdit: EditKind | null;
  /** The edit intents this keystroke applied to the document (for the collaboration wire). */
  outbox: EditIntent[];
  ruler: Ruler;
  showControls: boolean;
  marginRelease: boolean;
  tempIndent: number | null;
  helpLevel: 0 | 1 | 2 | 3;
  pendingExport: "pdf" | "html" | "txt" | "md" | "ws" | null;
  /** One-shot signal: ^K R was pressed; main.ts opens the file picker and clears this. */
  pendingImport: boolean;
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
    helpLevel: 3,
    pendingExport: null,
    pendingImport: false,
    outbox: [],
  };
}

/** Ruler with left/right/spacing positionally overridden by dot commands above `line`. */
export function effectiveRuler(state: EditorState, line: number): Ruler {
  const layout = scanLayout(state.document, line, {
    left: state.ruler.left, right: state.ruler.right, spacing: state.ruler.spacing,
  });
  return { ...state.ruler, left: layout.left, right: layout.right, spacing: layout.spacing };
}

/** Seal the current undo chunk (movement, mode toggle, prefixes): just clear the coalescing marker. */
function sealChunk(state: EditorState): EditorState {
  return state.lastEdit === null ? state : { ...state, lastEdit: null };
}

/** Apply a sequential batch of intents to a document. */
function applyIntents(doc: TextDocument, intents: EditIntent[]): TextDocument {
  return intents.reduce(applyIntent, doc);
}

/**
 * Apply this keystroke's `intents` to the document, append them to the outbox,
 * and record them in the undo history. Consecutive edits of the same coalescable
 * kind ("type"/"backspace") extend one undo entry; any other kind (or a change
 * of kind) pushes a fresh entry and clears the redo stack.
 */
function edit(
  state: EditorState,
  intents: EditIntent[],
  kind: EditKind | null,
  cursorAfter: Position,
): EditorState {
  const inverses = invertIntents(state.document, intents);
  const document = applyIntents(state.document, intents);
  const outbox = [...state.outbox, ...intents];

  let undoStack = state.history.undo;
  if (kind !== null && kind === state.lastEdit && undoStack.length > 0) {
    const last = undoStack[undoStack.length - 1]!;
    undoStack = [
      ...undoStack.slice(0, -1),
      {
        intents: [...last.intents, ...intents],
        inverses: [...inverses, ...last.inverses], // new edits revert first
        cursorBefore: last.cursorBefore,
        cursorAfter,
      },
    ];
  } else {
    undoStack = [
      ...undoStack,
      { intents, inverses, cursorBefore: state.cursor, cursorAfter },
    ].slice(-UNDO_LIMIT);
  }

  return {
    ...state,
    document,
    cursor: cursorAfter,
    history: { undo: undoStack, redo: [] },
    lastEdit: kind,
    outbox,
  };
}

function undo(state: EditorState): EditorState {
  const { undo: undoStack, redo: redoStack } = state.history;
  if (undoStack.length === 0) return state;
  const entry = undoStack[undoStack.length - 1]!;
  const document = applyIntents(state.document, entry.inverses);
  return {
    ...state,
    document,
    cursor: clampCursor(document, entry.cursorBefore),
    history: { undo: undoStack.slice(0, -1), redo: [...redoStack, entry] },
    lastEdit: null,
    outbox: [...state.outbox, ...entry.inverses],
  };
}

function redo(state: EditorState): EditorState {
  const { undo: undoStack, redo: redoStack } = state.history;
  if (redoStack.length === 0) return state;
  const entry = redoStack[redoStack.length - 1]!;
  const document = applyIntents(state.document, entry.intents);
  return {
    ...state,
    document,
    cursor: clampCursor(document, entry.cursorAfter),
    history: { undo: [...undoStack, entry], redo: redoStack.slice(0, -1) },
    lastEdit: null,
    outbox: [...state.outbox, ...entry.intents],
  };
}

/**
 * Integrate a peer's applied intents: apply them to the document and shift the
 * cursor, block marks, and undo/redo history past them. Pure; used by main.ts
 * when a remote op arrives. Throws if an intent cannot apply (caller resyncs).
 */
export function applyRemoteIntents(state: EditorState, intents: EditIntent[]): EditorState {
  const document = applyIntents(state.document, intents);
  const shift = (p: Position): Position =>
    intents.reduce((q, op) => transformPosition(q, op), p);
  const shiftEntry = (e: HistoryEntry): HistoryEntry => ({
    intents: transformIntents(e.intents, intents),
    inverses: transformIntents(e.inverses, intents),
    cursorBefore: shift(e.cursorBefore),
    cursorAfter: shift(e.cursorAfter),
  });
  const keep = (e: HistoryEntry) => e.intents.length > 0 || e.inverses.length > 0;
  return {
    ...state,
    document,
    cursor: clampCursor(document, shift(state.cursor)),
    blockStart: state.blockStart ? shift(state.blockStart) : null,
    blockEnd: state.blockEnd ? shift(state.blockEnd) : null,
    history: {
      undo: state.history.undo.map(shiftEntry).filter(keep),
      redo: state.history.redo.map(shiftEntry).filter(keep),
    },
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
  // Each keystroke starts with an empty outbox; edits fill it for main.ts to send.
  if (state.outbox.length > 0) state = { ...state, outbox: [] };
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
  if (state.pending === "print") {
    return resolvePrint({ ...state, pending: null }, ev.key.toLowerCase());
  }
  if (state.pending === "help") {
    return resolveHelp({ ...state, pending: null }, ev.key.toLowerCase());
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

  // ^P — begin a print-control (embedded control char) prefix
  if (ev.ctrl && ev.key.toLowerCase() === "p") {
    return { ...sealChunk(state), pending: "print" };
  }

  // ^J — begin a help-level prefix
  if (ev.ctrl && ev.key.toLowerCase() === "j") {
    return { ...sealChunk(state), pending: "help" };
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
    const next = edit(
      state,
      [{ kind: "splitLine", at: state.cursor }],
      null,
      { line: state.cursor.line + 1, col: 0 },
    );
    return { ...next, tempIndent: null, marginRelease: false };
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
  const { cursor, mode } = state;
  const intents: EditIntent[] = [];
  const atEndOfLine = cursor.col >= lineLength(state.document, cursor.line);
  if (mode === "overtype" && !atEndOfLine) {
    intents.push({ kind: "deleteRange", start: cursor, end: { line: cursor.line, col: cursor.col + 1 } });
  }
  intents.push({ kind: "insertText", at: cursor, text: ch });
  const newCursor: Position = { line: cursor.line, col: cursor.col + 1 };
  let doc = applyIntents(state.document, intents);

  const wrappable = state.ruler.wordWrap && !state.marginRelease;
  const line = doc.lines[newCursor.line] ?? "";
  const eff = effectiveRuler(state, newCursor.line);
  const needsWrap =
    wrappable && !isDotLine(line) && displayWidth(line) > eff.right + 1;
  const breakAt = needsWrap ? wrapPoint(line, eff.right, eff.left) : null;

  if (breakAt === null) return edit(state, intents, "type", newCursor);

  const wasInSpill = newCursor.col > breakAt;
  // Trim a single trailing space at the break point: the space that triggered the
  // break is consumed by the wrap itself, not carried onto either line.
  const trimmedBreak = line[breakAt - 1] === " " ? breakAt - 1 : breakAt;
  intents.push({ kind: "splitLine", at: { line: newCursor.line, col: breakAt }, break: "soft" });
  if (trimmedBreak < breakAt) {
    intents.push({
      kind: "deleteRange",
      start: { line: newCursor.line, col: trimmedBreak },
      end: { line: newCursor.line, col: breakAt },
    });
  }
  doc = applyIntents(state.document, intents);
  const indent = " ".repeat(state.tempIndent ?? eff.left);
  const spillLine = doc.lines[newCursor.line + 1] ?? "";
  const spilled = spillLine.replace(/^ +/, "");
  intents.push({
    kind: "deleteRange",
    start: { line: newCursor.line + 1, col: 0 },
    end: { line: newCursor.line + 1, col: spillLine.length },
  });
  intents.push({ kind: "insertText", at: { line: newCursor.line + 1, col: 0 }, text: indent + spilled });

  const wrappedCursor: Position = wasInSpill
    ? { line: newCursor.line + 1, col: indent.length + (newCursor.col - breakAt) }
    : newCursor;

  return edit(state, intents, "type", wrappedCursor);
}

/** Find the start of the paragraph containing `line` (scan back past soft breaks, never past a dot line). */
function paragraphStart(doc: TextDocument, line: number): number {
  let start = line;
  while (
    start > 0 &&
    doc.returns[start - 1] === "soft" &&
    !isDotLine(doc.lines[start - 1] ?? "")
  )
    start--;
  return start;
}

function reflowParagraphAt(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (isDotLine(document.lines[cursor.line] ?? "")) return state;

  const fromLine = paragraphStart(document, cursor.line);
  const eff = effectiveRuler(state, fromLine);

  // Clamp the reflow range so it never crosses an embedded dot line.
  let endLine = fromLine;
  while (
    endLine < document.lines.length - 1 &&
    document.returns[endLine] !== "hard" &&
    !isDotLine(document.lines[endLine + 1] ?? "")
  )
    endLine++;

  const { document: reflowed, position } = reflowParagraph(
    document,
    fromLine,
    { left: eff.left, right: eff.right, justify: eff.justify },
    cursor,
    endLine,
  );

  // Express the reflow as intents: replace the old paragraph span with the new
  // lines, then fix up the return flags to match the reflowed document.
  const newCount = reflowed.lines.length - document.lines.length + (endLine - fromLine + 1);
  const intents: EditIntent[] = [
    {
      kind: "deleteRange",
      start: { line: fromLine, col: 0 },
      end: { line: endLine, col: lineLength(document, endLine) },
    },
    {
      kind: "insertText",
      at: { line: fromLine, col: 0 },
      text: reflowed.lines.slice(fromLine, fromLine + newCount).join("\n"),
    },
  ];
  for (let i = 0; i < newCount; i++) {
    intents.push({ kind: "setReturn", line: fromLine + i, return: reflowed.returns[fromLine + i]! });
  }
  return edit(state, intents, null, position);
}

function backspace(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (cursor.col > 0) {
    const start: Position = { line: cursor.line, col: cursor.col - 1 };
    return edit(state, [{ kind: "deleteRange", start, end: cursor }], "backspace", start);
  }
  if (cursor.line > 0) {
    const prevLen = lineLength(document, cursor.line - 1);
    const start: Position = { line: cursor.line - 1, col: prevLen };
    return edit(
      state,
      [{ kind: "deleteRange", start, end: { line: cursor.line, col: 0 } }],
      "backspace",
      start,
    );
  }
  return state;
}

function deleteForward(state: EditorState): EditorState {
  const { document, cursor } = state;
  if (cursor.col < lineLength(document, cursor.line)) {
    return edit(
      state,
      [{ kind: "deleteRange", start: cursor, end: { line: cursor.line, col: cursor.col + 1 } }],
      null,
      cursor,
    );
  }
  if (cursor.line < document.lines.length - 1) {
    return edit(
      state,
      [{ kind: "deleteRange", start: cursor, end: { line: cursor.line + 1, col: 0 } }],
      null,
      cursor,
    );
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
    case "p":
      // Open export format selection prompt (single-keypress choice).
      return { ...state, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown W=WordStar", buffer: "", target: "export" } };
    case "r":
      // Read/import a file: main.ts opens the file picker on this signal.
      return { ...state, pendingImport: true };
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

/** Mapping from ^P sub-key to the embedded control character it inserts. */
export const PRINT_CONTROLS: Record<string, string> = {
  b: "\x02",
  s: "\x13",
  y: "\x19",
  d: "\x04",
  x: "\x18",
  t: "\x14",
  v: "\x16",
  o: "\x0F",
};

/** Resolve the second key of a ^P print-control command: insert one control char. */
function resolvePrint(state: EditorState, key: string): EditorState {
  const ch = PRINT_CONTROLS[key];
  if (!ch) return state;
  const { cursor } = state;
  return edit(
    state,
    [{ kind: "insertText", at: cursor, text: ch }],
    null,
    { line: cursor.line, col: cursor.col + 1 },
  );
}

/** Resolve the second key of a ^J help command. Unknown keys just clear the prefix. */
function resolveHelp(state: EditorState, key: string): EditorState {
  switch (key) {
    case "h":
      return { ...state, prompt: { label: "HELP LEVEL (0-3):", buffer: "", target: "helpLevel" } };
    default:
      return state; // prefix already cleared by caller
  }
}

function centerLine(state: EditorState): EditorState {
  const { document, cursor } = state;
  const ruler = effectiveRuler(state, cursor.line);
  const line = document.lines[cursor.line] ?? "";
  const trimmed = line.trim();
  if (trimmed.length === 0) return state;
  const width = ruler.right - ruler.left + 1;
  const col = Math.max(ruler.left, ruler.left + Math.floor((width - trimmed.length) / 2));
  const newLine = " ".repeat(col) + trimmed;
  const intents: EditIntent[] = [
    { kind: "deleteRange", start: { line: cursor.line, col: 0 }, end: { line: cursor.line, col: line.length } },
    { kind: "insertText", at: { line: cursor.line, col: 0 }, text: newLine },
  ];
  return edit(state, intents, null, { line: cursor.line, col: newLine.length });
}

function copyBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const text = getRange(state.document, block.start, block.end);
  const next = edit(
    state,
    [{ kind: "insertText", at: state.cursor, text }],
    null,
    insertEnd(state.cursor, text),
  );
  return { ...next, blockStart: null, blockEnd: null };
}

function deleteBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const next = edit(
    state,
    [{ kind: "deleteRange", start: block.start, end: block.end }],
    null,
    block.start,
  );
  return { ...next, blockStart: null, blockEnd: null };
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

  const text = getRange(state.document, start, end);

  let target: Position;
  if (isBeforePosition(cursor, start)) {
    target = cursor;
  } else if (cursor.line > end.line) {
    target = { line: cursor.line - (end.line - start.line), col: cursor.col };
  } else {
    // cursor.line === end.line && cursor.col >= end.col
    target = { line: start.line, col: start.col + (cursor.col - end.col) };
  }

  const intents: EditIntent[] = [
    { kind: "deleteRange", start, end },
    { kind: "insertText", at: target, text },
  ];
  const next = edit(state, intents, null, insertEnd(target, text));
  return { ...next, blockStart: null, blockEnd: null };
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

  // Export format selection: single keypress choice.
  if (prompt.target === "export") {
    if (!ev.ctrl && ev.key === "Escape") {
      return { ...state, prompt: null };
    }
    const key = ev.key.toLowerCase();
    const exportMap: Record<string, "pdf" | "html" | "txt" | "md" | "ws"> = { p: "pdf", h: "html", t: "txt", m: "md", w: "ws" };
    if (key in exportMap) {
      return { ...state, prompt: null, pendingExport: exportMap[key]! };
    }
    // Any other key is ignored (no state change).
    return state;
  }

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
      case "helpLevel": {
        const val = parseInt(prompt.buffer, 10);
        if (isNaN(val) || val < 0 || val > 3 || String(val) !== prompt.buffer.trim()) return { ...state, prompt: null };
        return { ...state, helpLevel: val as 0 | 1 | 2 | 3, prompt: null };
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

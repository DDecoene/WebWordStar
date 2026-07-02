# Editor Core MVP Implementation Plan (v1.0.0 — Stage 2a)

> ✅ **Shipped** — merged into `release/v1.0.0` (PR #11, part of issue #5).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A genuinely interactive WordStar editor in the browser: type text, move with the diamond and `^Q` quick commands, edit (split/backspace/delete), toggle insert/overtype, with a live status line and block cursor.

**Architecture:** A *pure* editor reducer (`src/editor/state.ts`) holds an `EditorState` (document + cursor + mode + pending-prefix) and maps normalized key events to new states, delegating text changes to the Stage 1 document model. A *pure* renderer (`src/editor/render.ts`) turns an `EditorState` into an HTML string (testable in node). `src/main.ts` wires real DOM `keydown` events into the reducer and re-renders. All logic is unit-tested with Vitest; the end-to-end keyboard experience is covered with Playwright.

**Tech Stack:** TypeScript (ESM), Vite, Vitest, Playwright. Builds on Stage 1 (`src/shared/document.ts`, `src/shared/types.ts`).

This is Stage 2a of the v1.0.0 milestone (issue #5). Source spec: `docs/superpowers/specs/2026-06-28-webwordstar-v1.0.0-design.md` §4.2 (command interpreter) and §4.3 (renderer). Deferred to later sub-stages: `^K`/`^O`/`^P` prefixes, self-revealing prefix menus, help levels, ruler + flag column, word-wrap + `^B` reform, undo/redo.

---

## File Structure

- `src/editor/state.ts` — `EditorState`, `KeyEvent`, `createEditorState`, cursor helpers, and the `applyKey` reducer.
- `src/editor/render.ts` — `renderEditor(state): string` producing the status line + screen with a block cursor.
- `src/main.ts` (modify) — wire `keydown` → `applyKey` → `renderEditor`.
- `tests/editor-state.test.ts` — unit tests for the reducer.
- `tests/editor-render.test.ts` — unit tests for the renderer.
- `tests/editor.spec.ts` — Playwright e2e for the real typing experience.

---

## Conventions used throughout

- **Positions are zero-based** (`{line, col}`), matching Stage 1. The status line displays them **one-based**.
- A **`KeyEvent`** is the normalized shape `{ key: string; ctrl: boolean }`. `key` is the value from the DOM `KeyboardEvent.key` (e.g. `"a"`, `"Enter"`, `"Backspace"`, `"e"`). Control-chords arrive as `{ key: "e", ctrl: true }` etc.
- The reducer is **pure**: `applyKey(state, ev)` returns a new `EditorState`; it never mutates its input and performs no I/O.
- Text changes go through the Stage 1 model functions (`insertText`, `deleteRange`, `splitLine`, `applyIntent`), never by editing `lines` directly.

---

## Task 1: EditorState, helpers, and a no-op reducer

**Files:**
- Create: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createEditorState, lineLength, clampCursor, applyKey } from "../src/editor/state";

describe("createEditorState", () => {
  it("starts with an empty document, cursor at origin, insert mode", () => {
    const s = createEditorState();
    expect(s.document.lines).toEqual([""]);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    expect(s.mode).toBe("insert");
    expect(s.pending).toBeNull();
  });

  it("accepts initial text and a filename", () => {
    const s = createEditorState("hi\nthere", "DOC.TXT");
    expect(s.document.lines).toEqual(["hi", "there"]);
    expect(s.filename).toBe("DOC.TXT");
  });
});

describe("helpers", () => {
  it("lineLength returns the length of a given line", () => {
    const s = createEditorState("hello\nbye");
    expect(lineLength(s.document, 0)).toBe(5);
    expect(lineLength(s.document, 1)).toBe(3);
  });

  it("clampCursor keeps the cursor within the document", () => {
    const s = createEditorState("ab\ncde");
    expect(clampCursor(s.document, { line: 5, col: 9 })).toEqual({ line: 1, col: 3 });
    expect(clampCursor(s.document, { line: -1, col: -4 })).toEqual({ line: 0, col: 0 });
  });
});

describe("applyKey (unknown keys)", () => {
  it("returns the state unchanged for an unhandled key", () => {
    const s = createEditorState("abc");
    const next = applyKey(s, { key: "F1", ctrl: false });
    expect(next).toEqual(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — cannot find module `../src/editor/state`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Position, TextDocument } from "../shared/types";
import { createDocument } from "../shared/document";

export type EditorMode = "insert" | "overtype";
export type Pending = null | "quick"; // "quick" = the ^Q prefix is active

export interface EditorState {
  document: TextDocument;
  cursor: Position;
  mode: EditorMode;
  pending: Pending;
  filename: string;
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

export function applyKey(state: EditorState, _ev: KeyEvent): EditorState {
  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: add editor state, cursor helpers, and reducer skeleton"
```

---

## Task 2: Typing printable characters + insert/overtype (^V)

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("typing printable characters", () => {
  it("inserts a character and advances the cursor", () => {
    let s = createEditorState();
    s = applyKey(s, { key: "h", ctrl: false });
    s = applyKey(s, { key: "i", ctrl: false });
    expect(s.document.lines).toEqual(["hi"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it("inserts in the middle of existing text", () => {
    let s = createEditorState("ac");
    s = { ...s, cursor: { line: 0, col: 1 } };
    s = applyKey(s, { key: "b", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it("^V toggles overtype mode, which replaces the character under the cursor", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "v", ctrl: true });
    expect(s.mode).toBe("overtype");
    s = applyKey(s, { key: "X", ctrl: false });
    expect(s.document.lines).toEqual(["Xbc"]);
    expect(s.cursor).toEqual({ line: 0, col: 1 });
  });

  it("overtype at end of line appends rather than replacing past the end", () => {
    let s = createEditorState("ab");
    s = { ...s, mode: "overtype", cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
    expect(s.cursor).toEqual({ line: 0, col: 3 });
  });

  it("ignores control-modified keys as text (they are commands, not input)", () => {
    let s = createEditorState();
    s = applyKey(s, { key: "a", ctrl: true });
    expect(s.document.lines).toEqual([""]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — printable typing not handled / `^V` does nothing.

- [ ] **Step 3: Replace the `applyKey` implementation** in `src/editor/state.ts`

Add the import at the top (extend the existing import line):
```ts
import { createDocument, insertText, deleteRange } from "../shared/document";
```

Replace the `applyKey` function with:
```ts
/** True for a single printable character (length-1, not a named key like "Enter"). */
function isPrintable(ev: KeyEvent): boolean {
  return !ev.ctrl && ev.key.length === 1;
}

export function applyKey(state: EditorState, ev: KeyEvent): EditorState {
  // ^V — toggle insert/overtype
  if (ev.ctrl && ev.key.toLowerCase() === "v") {
    return { ...state, mode: state.mode === "insert" ? "overtype" : "insert" };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: type printable characters with insert/overtype (^V)"
```

---

## Task 3: Enter, Backspace, and ^G (delete) with line joins

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("Enter / Backspace / ^G", () => {
  it("Enter splits the line and moves to the start of the new line", () => {
    let s = createEditorState("hello");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.document.lines).toEqual(["he", "llo"]);
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });

  it("Backspace removes the character to the left", () => {
    let s = createEditorState("abc");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.document.lines).toEqual(["ac"]);
    expect(s.cursor).toEqual({ line: 0, col: 1 });
  });

  it("Backspace at column 0 joins with the previous line", () => {
    let s = createEditorState("ab\ncd");
    s = { ...s, cursor: { line: 1, col: 0 } };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.document.lines).toEqual(["abcd"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it("Backspace at the very start is a no-op", () => {
    let s = createEditorState("ab");
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.document.lines).toEqual(["ab"]);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });

  it("^G deletes the character to the right", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "g", ctrl: true });
    expect(s.document.lines).toEqual(["bc"]);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });

  it("^G at end of line joins the next line", () => {
    let s = createEditorState("ab\ncd");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "g", ctrl: true });
    expect(s.document.lines).toEqual(["abcd"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — Enter/Backspace/^G not handled.

- [ ] **Step 3: Extend `applyKey`** in `src/editor/state.ts`

Add `splitLine` to the document import line:
```ts
import { createDocument, insertText, deleteRange, splitLine } from "../shared/document";
```

In `applyKey`, add these branches **before** the `isPrintable(ev)` check:
```ts
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
```

Add these helper functions at the bottom of the file:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: Enter/Backspace/^G editing with line joins"
```

---

## Task 4: The diamond — ^E ^X ^S ^D character movement

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("the diamond (character movement)", () => {
  const doc = "abc\ndef";
  it("^D moves right, wrapping to the next line at end of line", () => {
    let s = createEditorState(doc);
    s = { ...s, cursor: { line: 0, col: 3 } };
    s = applyKey(s, { key: "d", ctrl: true });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });
  it("^S moves left, wrapping to the previous line end", () => {
    let s = createEditorState(doc);
    s = { ...s, cursor: { line: 1, col: 0 } };
    s = applyKey(s, { key: "s", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 3 });
  });
  it("^E moves up, clamping the column to the shorter line", () => {
    let s = createEditorState("ab\nlonger");
    s = { ...s, cursor: { line: 1, col: 6 } };
    s = applyKey(s, { key: "e", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });
  it("^X moves down", () => {
    let s = createEditorState(doc);
    s = applyKey(s, { key: "x", ctrl: true });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });
  it("^S at the very start and ^D at the very end are no-ops", () => {
    let start = createEditorState(doc);
    expect(applyKey(start, { key: "s", ctrl: true }).cursor).toEqual({ line: 0, col: 0 });
    let end = { ...createEditorState(doc), cursor: { line: 1, col: 3 } };
    expect(applyKey(end, { key: "d", ctrl: true }).cursor).toEqual({ line: 1, col: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — diamond movement not handled.

- [ ] **Step 3: Extend `applyKey`** in `src/editor/state.ts`

Add these branches in `applyKey` (after the `^G` branch, before `isPrintable`):
```ts
  if (ev.ctrl) {
    const moved = moveDiamond(state, ev.key.toLowerCase());
    if (moved) return moved;
  }
```

Add this helper at the bottom of the file:
```ts
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
    default:
      return null;
  }
}
```

> Note: `moveDiamond` returns `null` only for keys it doesn't handle, so other `^`-commands (like `^G`, `^V`) still work — they are matched by their own branches earlier in `applyKey`. The `^E/^X/^S/^D` keys never reach those because their branches come first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: diamond cursor movement (^E ^X ^S ^D)"
```

---

## Task 5: Word movement — ^A (word left) and ^F (word right)

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("word movement (^A / ^F)", () => {
  it("^F moves to the start of the next word on the line", () => {
    let s = createEditorState("foo bar baz");
    s = applyKey(s, { key: "f", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 4 });
    s = applyKey(s, { key: "f", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 8 });
  });
  it("^A moves to the start of the current/previous word", () => {
    let s = createEditorState("foo bar baz");
    s = { ...s, cursor: { line: 0, col: 9 } };
    s = applyKey(s, { key: "a", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 8 });
    s = applyKey(s, { key: "a", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 4 });
  });
  it("^F at end of line moves to the start of the next line", () => {
    let s = createEditorState("ab\ncd");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "f", ctrl: true });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — `^A`/`^F` not handled.

- [ ] **Step 3: Extend `moveDiamond`** in `src/editor/state.ts`

Add two cases to the `switch` in `moveDiamond`, before `default`:
```ts
    case "f":
      return { ...state, cursor: nextWord(document, cursor) };
    case "a":
      return { ...state, cursor: prevWord(document, cursor) };
```

Add these helpers at the bottom of the file:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (25 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: word movement (^A / ^F)"
```

---

## Task 6: The ^Q quick-movement prefix

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("^Q quick movement prefix", () => {
  it("^Q sets a pending prefix without changing the document", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "q", ctrl: true });
    expect(s.pending).toBe("quick");
    expect(s.document.lines).toEqual(["abc"]);
  });
  it("^Q S goes to start of line; ^Q D to end of line", () => {
    let s = createEditorState("hello world");
    s = { ...s, cursor: { line: 0, col: 5 } };
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "s", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    expect(s.pending).toBeNull();
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "d", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 11 });
  });
  it("^Q R goes to start of document; ^Q C to end of document", () => {
    let s = createEditorState("one\ntwo\nthree");
    s = { ...s, cursor: { line: 1, col: 1 } };
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.cursor).toEqual({ line: 2, col: 5 });
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "r", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });
  it("an unrecognized key after ^Q just clears the prefix", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "z", ctrl: false });
    expect(s.pending).toBeNull();
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    expect(s.document.lines).toEqual(["abc"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — `^Q` prefix not handled.

- [ ] **Step 3: Extend `applyKey`** in `src/editor/state.ts`

At the very top of `applyKey` (before all other branches), handle an active prefix and the `^Q` trigger:
```ts
  // If a prefix is pending, this key completes the quick command.
  if (state.pending === "quick") {
    return resolveQuick({ ...state, pending: null }, ev.key.toLowerCase());
  }

  // ^Q — begin a quick-movement prefix
  if (ev.ctrl && ev.key.toLowerCase() === "q") {
    return { ...state, pending: "quick" };
  }
```

Add this helper at the bottom of the file:
```ts
/** Resolve the second key of a ^Q quick command. Unknown keys just clear the prefix. */
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (29 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: ^Q quick-movement prefix (line/screen/document ends)"
```

---

## Task 7: The renderer — status line, screen, block cursor

**Files:**
- Create: `src/editor/render.ts`
- Test: `tests/editor-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderEditor } from "../src/editor/render";
import { createEditorState } from "../src/editor/state";

describe("renderEditor", () => {
  it("renders a status line with one-based line/col and the mode", () => {
    const s = createEditorState("hello", "DOC.TXT");
    const html = renderEditor(s);
    expect(html).toContain("DOC.TXT");
    expect(html).toContain("LINE 1");
    expect(html).toContain("COL 1");
    expect(html).toContain("INSERT");
  });

  it("shows OVERTYPE when in overtype mode", () => {
    const s = { ...createEditorState("x"), mode: "overtype" as const };
    expect(renderEditor(s)).toContain("OVERTYPE");
  });

  it("renders the document text in the screen region", () => {
    const s = createEditorState("alpha\nbeta");
    const html = renderEditor(s);
    expect(html).toContain("alpha");
    expect(html).toContain("beta");
  });

  it("marks the cursor cell with a cursor span", () => {
    const s = { ...createEditorState("ab"), cursor: { line: 0, col: 1 } };
    const html = renderEditor(s);
    expect(html).toContain('<span class="cursor">b</span>');
  });

  it("renders a block cursor at end of line as a space cell", () => {
    const s = { ...createEditorState("ab"), cursor: { line: 0, col: 2 } };
    const html = renderEditor(s);
    expect(html).toContain('<span class="cursor"> </span>');
  });

  it("escapes HTML special characters in the text", () => {
    const s = createEditorState("a<b>&c");
    const html = renderEditor(s);
    expect(html).toContain("a&lt;b&gt;&amp;c");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-render.test.ts`
Expected: FAIL — cannot find module `../src/editor/render`.

- [ ] **Step 3: Write the implementation**

```ts
import type { EditorState } from "./state";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-render.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/render.ts tests/editor-render.test.ts
git commit -m "feat: editor renderer with status line and block cursor"
```

---

## Task 8: Wire the DOM and add the Playwright e2e

**Files:**
- Modify: `src/main.ts`
- Create: `tests/editor.spec.ts`
- Replace: `tests/smoke.spec.ts` is superseded — delete it (its assertion no longer matches the new UI).

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { createEditorState, applyKey, type EditorState, type KeyEvent } from "./editor/state";
import { renderEditor } from "./editor/render";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  let state: EditorState = createEditorState("", "UNTITLED");

  const paint = () => {
    app.innerHTML = renderEditor(state);
  };

  // Keys that are meaningful to the editor; everything else falls through to the browser.
  const NAMED = new Set(["Enter", "Backspace"]);

  window.addEventListener("keydown", (e) => {
    const ev: KeyEvent = { key: e.key, ctrl: e.ctrlKey };
    const handled = ev.ctrl || NAMED.has(e.key) || e.key.length === 1;
    if (!handled) return;
    e.preventDefault();
    state = applyKey(state, ev);
    paint();
  });

  paint();
}
```

- [ ] **Step 2: Delete the superseded smoke test**

Run: `git rm tests/smoke.spec.ts`
Expected: file removed.

- [ ] **Step 3: Write the Playwright e2e**

```ts
import { test, expect } from "@playwright/test";

test("type, navigate with the diamond, and see the status line update", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");
  const status = page.getByTestId("status");

  await page.keyboard.type("Hello");
  await expect(screen).toContainText("Hello");
  await expect(status).toContainText("COL 6");

  // ^S moves left one character (the diamond)
  await page.keyboard.press("Control+s");
  await expect(status).toContainText("COL 5");

  // ^Q then D jumps to end of line
  await page.keyboard.press("Control+q");
  await page.keyboard.press("d");
  await expect(status).toContainText("COL 6");

  // Enter splits to a new line
  await page.keyboard.press("Enter");
  await expect(status).toContainText("LINE 2");
});
```

- [ ] **Step 4: Run the unit tests, type-check, build, and e2e**

Run:
```bash
npm test
npx tsc --noEmit
npm run build
npx playwright test
```
Expected: all unit tests pass; tsc exit 0; build succeeds; Playwright `editor.spec.ts` passes (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts tests/editor.spec.ts
git commit -m "feat: wire keyboard input to the editor and add e2e coverage"
```

---

## Self-Review

**Spec coverage (Stage 2a portion):** Command interpreter (spec §4.2) — pure `applyKey` reducer mapping keystrokes to intents/cursor moves: diamond `^E^S^D^X`, word `^A^F`, `^Q` quick movement, printable insert, `^V` insert/overtype, Enter/Backspace/`^G` ✓. Renderer (spec §4.3) — status line (filename, PAGE/LINE/COL, INSERT/OVERTYPE) + screen + block cursor ✓. Modeless editing (always typing; commands via Ctrl) ✓. Keyboard-first ✓. Text changes go through the Stage 1 pure model ✓. Playwright e2e for the real experience ✓. Explicitly deferred and NOT in this plan: `^K`/`^O`/`^P`, self-revealing menus, help levels, ruler + flag column, word-wrap + `^B`, undo/redo (later sub-stages of issue #5).

**Placeholder scan:** No TBD/TODO/vague steps; every code step shows complete code; every command shows expected output and test counts.

**Type consistency:** `EditorState` (document/cursor/mode/pending/filename), `KeyEvent` (key/ctrl), and `EditorMode`/`Pending` are defined once in Task 1 and used consistently. `applyKey`, `createEditorState`, `lineLength`, `clampCursor`, `renderEditor` names are stable across tasks. Helper functions (`typeChar`, `backspace`, `deleteForward`, `moveDiamond`, `nextWord`, `prevWord`, `resolveQuick`) are each introduced once and only referenced after definition. Document-model calls (`insertText`, `deleteRange`, `splitLine`, `createDocument`) match the Stage 1 signatures.

**Ordering note for the executor:** branch matching order inside `applyKey` matters — the pending-prefix check and `^Q` trigger must be first; `^V`, Enter/Backspace/`^G`, then the `ev.ctrl` diamond/word block, then `isPrintable`. Keep that order when assembling the function across Tasks 2–6.

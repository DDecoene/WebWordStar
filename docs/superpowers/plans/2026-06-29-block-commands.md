# Block Commands Implementation Plan (v1.0.0 — Stage 2b)

> ✅ **Shipped** — merged into `release/v1.0.0` (PR #12, part of issue #5). Block move `^KV` deferred.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WordStar `^K` block operations to the editor: mark a block (`^KB`/`^KK`), copy it (`^KC`), delete it (`^KY`), hide/show the highlight (`^KH`), with the block region visibly highlighted on screen.

**Architecture:** Two pure model helpers are added to the Stage 1 document model (`getRange`, `insertMultiline`) so multi-line text can be extracted and inserted. The editor reducer (`src/editor/state.ts`) gains block-marker state and a `^K` prefix that resolves the second key. The renderer (`src/editor/render.ts`) is reworked to a per-character cell model so the block highlight and the block cursor can coexist. All logic is unit-tested; the experience is covered with Playwright.

**Tech Stack:** TypeScript (ESM), Vite, Vitest, Playwright. Builds on Stage 1 (`src/shared/document.ts`) and Stage 2a (`src/editor/state.ts`, `src/editor/render.ts`).

This is Stage 2b of the v1.0.0 milestone (part of issue #5). Spec: `docs/superpowers/specs/2026-06-28-webwordstar-v1.0.0-design.md` §4.2/§4.3. Retrospective reference: `docs/wordstar-retrospective.md` §7 (the `^K` family).

**Deferred to Stage 2c (NOT in this plan):** block move (`^KV`), column blocks (`^KN`), write/read block to file (`^KW`/`^KR`), the `^O`/`^P` prefixes, self-revealing prefix menus, help levels, ruler + flag column, word-wrap + `^B`, undo/redo.

**Simplification (documented intent):** After a copy or delete, the block markers are cleared (highlight removed). Classic WordStar keeps the source marked after a copy; clearing avoids stale-marker position math and is an acceptable MVP behavior. This is intentional, not an oversight.

---

## File Structure

- `src/shared/document.ts` (modify) — add `getRange` and `insertMultiline`.
- `src/editor/state.ts` (modify) — add block state to `EditorState`, the `^K` prefix, `resolveBlock`, and an `orderedBlock` helper.
- `src/editor/render.ts` (modify) — rework `renderEditor`/`renderLine` to a per-cell model that supports a block highlight plus the cursor.
- `tests/document.test.ts` (modify) — tests for `getRange`/`insertMultiline`.
- `tests/editor-state.test.ts` (modify) — tests for block marking/copy/delete/hide.
- `tests/editor-render.test.ts` (modify) — tests for block highlight rendering.
- `tests/editor-blocks.spec.ts` (create) — Playwright e2e for block ops.

---

## Conventions

- Positions remain zero-based `{line, col}`. "Document order" means `(a.line < b.line) || (a.line === b.line && a.col <= b.col)`.
- `orderedBlock` returns the two markers sorted into `{start, end}` with `start <= end`, or `null` if either marker is unset.
- The reducer stays pure; text changes go through the model functions only.

---

## Task 1: Model helpers — getRange and insertMultiline

**Files:**
- Modify: `src/shared/document.ts`
- Test: `tests/document.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/document.test.ts`)

```ts
import { getRange, insertMultiline } from "../src/shared/document";

describe("getRange", () => {
  it("returns text within a single line", () => {
    const doc = createDocument("abcdef");
    expect(getRange(doc, { line: 0, col: 1 }, { line: 0, col: 4 })).toBe("bcd");
  });
  it("returns text across multiple lines joined by newlines", () => {
    const doc = createDocument("hello\nbig\nworld");
    expect(getRange(doc, { line: 0, col: 2 }, { line: 2, col: 2 })).toBe("llo\nbig\nwo");
  });
});

describe("insertMultiline", () => {
  it("inserts single-line text and reports the end position", () => {
    const doc = createDocument("ad");
    const r = insertMultiline(doc, { line: 0, col: 1 }, "bc");
    expect(getText(r.document)).toBe("abcd");
    expect(r.end).toEqual({ line: 0, col: 3 });
  });
  it("inserts multi-line text, splitting the target line", () => {
    const doc = createDocument("aZ");
    const r = insertMultiline(doc, { line: 0, col: 1 }, "b\ncc\nd");
    expect(r.document.lines).toEqual(["ab", "cc", "dZ"]);
    expect(r.end).toEqual({ line: 2, col: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document.test.ts`
Expected: FAIL — `getRange` / `insertMultiline` not exported.

- [ ] **Step 3: Add the implementation** (append to `src/shared/document.ts`)

```ts
/** Return the text between start (inclusive) and end (exclusive), in document order, joined by "\n". */
export function getRange(doc: TextDocument, start: Position, end: Position): string {
  if (start.line === end.line) {
    return (doc.lines[start.line] ?? "").slice(start.col, end.col);
  }
  const first = (doc.lines[start.line] ?? "").slice(start.col);
  const middle = doc.lines.slice(start.line + 1, end.line);
  const last = (doc.lines[end.line] ?? "").slice(0, end.col);
  return [first, ...middle, last].join("\n");
}

/**
 * Insert text (which may contain newlines) at `at`. Returns the new document and
 * the end position just past the inserted text.
 */
export function insertMultiline(
  doc: TextDocument,
  at: Position,
  text: string,
): { document: TextDocument; end: Position } {
  const parts = text.split("\n");
  const lines = doc.lines.slice();
  const target = lines[at.line] ?? "";
  const head = target.slice(0, at.col);
  const tail = target.slice(at.col);

  if (parts.length === 1) {
    lines[at.line] = head + parts[0] + tail;
    return { document: { lines }, end: { line: at.line, col: at.col + parts[0]!.length } };
  }

  const firstLine = head + parts[0];
  const lastPart = parts[parts.length - 1]!;
  const lastLine = lastPart + tail;
  const middle = parts.slice(1, -1);
  lines.splice(at.line, 1, firstLine, ...middle, lastLine);
  return {
    document: { lines },
    end: { line: at.line + parts.length - 1, col: lastPart.length },
  };
}
```

> Note: extend the existing `import type { ... } from "./types";` line if needed (it already imports `TextDocument`, `Position`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document.test.ts`
Expected: PASS (the prior document tests plus 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/shared/document.ts tests/document.test.ts
git commit -m "feat: add getRange and insertMultiline to document model"
```

---

## Task 2: Block state and the ^K prefix (mark begin/end + hide)

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
import { orderedBlock } from "../src/editor/state";

describe("^K block marking", () => {
  it("^K sets a pending block prefix without changing the document", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    expect(s.pending).toBe("block");
    expect(s.document.lines).toEqual(["abc"]);
  });
  it("^KB marks block begin at the cursor; ^KK marks block end", () => {
    let s = createEditorState("hello world");
    s = { ...s, cursor: { line: 0, col: 0 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "b", ctrl: false });
    expect(s.blockStart).toEqual({ line: 0, col: 0 });
    expect(s.pending).toBeNull();
    s = { ...s, cursor: { line: 0, col: 5 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "k", ctrl: false });
    expect(s.blockEnd).toEqual({ line: 0, col: 5 });
  });
  it("orderedBlock returns sorted markers or null", () => {
    let s = createEditorState("abcdef");
    expect(orderedBlock(s)).toBeNull();
    s = { ...s, blockStart: { line: 0, col: 4 }, blockEnd: { line: 0, col: 1 } };
    expect(orderedBlock(s)).toEqual({ start: { line: 0, col: 1 }, end: { line: 0, col: 4 } });
  });
  it("^KH toggles the block hidden flag", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "h", ctrl: false });
    expect(s.hideBlock).toBe(true);
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "h", ctrl: false });
    expect(s.hideBlock).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — `orderedBlock` missing / `^K` not handled.

- [ ] **Step 3: Extend `src/editor/state.ts`**

Update `Pending` and `EditorState`:
```ts
export type Pending = null | "quick" | "block"; // ^Q quick, ^K block
```
Add three fields to the `EditorState` interface:
```ts
  blockStart: Position | null;
  blockEnd: Position | null;
  hideBlock: boolean;
```
Initialise them in `createEditorState`'s returned object:
```ts
    blockStart: null,
    blockEnd: null,
    hideBlock: false,
```

In `applyKey`, the pending-resolution branch at the top must now route by prefix kind. Replace the existing `if (state.pending === "quick") { ... }` block with:
```ts
  if (state.pending === "quick") {
    return resolveQuick({ ...state, pending: null }, ev.key.toLowerCase());
  }
  if (state.pending === "block") {
    return resolveBlock({ ...state, pending: null }, ev.key.toLowerCase());
  }
```
Add the `^K` trigger next to the `^Q` trigger:
```ts
  if (ev.ctrl && ev.key.toLowerCase() === "k") {
    return { ...state, pending: "block" };
  }
```

Add `orderedBlock` (exported) and `resolveBlock` at the bottom of the file:
```ts
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
```

> Note: the `^K` trigger and the `block` pending-resolution must sit alongside the existing `^Q` equivalents, preserving the overall branch order (pending → `^Q`/`^K` triggers → `^V` → Enter/Backspace/`^G` → ctrl diamond/word → printable).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (prior editor-state tests plus 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: ^K block prefix with mark begin/end and hide toggle"
```

---

## Task 3: Block copy (^KC) and delete (^KY)

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("^KC copy / ^KY delete", () => {
  function markBlock(s, start, end) {
    s = { ...s, cursor: start };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "b", ctrl: false });
    s = { ...s, cursor: end };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "k", ctrl: false });
    return s;
  }

  it("^KC copies the block to the cursor and clears the markers", () => {
    let s = createEditorState("abcXY");
    s = markBlock(s, { line: 0, col: 0 }, { line: 0, col: 3 }); // "abc"
    s = { ...s, cursor: { line: 0, col: 5 } }; // end of line
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abcXYabc"]);
    expect(s.cursor).toEqual({ line: 0, col: 8 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("^KC copies a multi-line block", () => {
    let s = createEditorState("ab\ncd\n");
    s = markBlock(s, { line: 0, col: 0 }, { line: 1, col: 2 }); // "ab\ncd"
    s = { ...s, cursor: { line: 2, col: 0 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["ab", "cd", "ab", "cd"]);
    expect(s.cursor).toEqual({ line: 3, col: 2 });
  });

  it("^KY deletes the block, moves the cursor to its start, and clears markers", () => {
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 1 }, { line: 0, col: 4 }); // "bcd"
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "y", ctrl: false });
    expect(s.document.lines).toEqual(["aef"]);
    expect(s.cursor).toEqual({ line: 0, col: 1 });
    expect(s.blockStart).toBeNull();
  });

  it("^KC with no block set is a no-op", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — `^KC`/`^KY` not implemented.

- [ ] **Step 3: Extend `resolveBlock`** in `src/editor/state.ts`

Add the document-model imports (extend the existing import line):
```ts
import { createDocument, insertText, deleteRange, splitLine, getRange, insertMultiline } from "../shared/document";
```

Add two cases to the `switch` in `resolveBlock`, before `default`:
```ts
    case "c":
      return copyBlock(state);
    case "y":
      return deleteBlock(state);
```

Add the helpers at the bottom of the file:
```ts
function copyBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const text = getRange(state.document, block.start, block.end);
  const { document, end } = insertMultiline(state.document, state.cursor, text);
  return { ...state, document, cursor: end, blockStart: null, blockEnd: null };
}

function deleteBlock(state: EditorState): EditorState {
  const block = orderedBlock(state);
  if (!block) return state;
  const document = deleteRange(state.document, block.start, block.end);
  return { ...state, document, cursor: block.start, blockStart: null, blockEnd: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (prior tests plus 4 new).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add src/editor/state.ts tests/editor-state.test.ts
git commit -m "feat: ^KC copy block and ^KY delete block"
```

---

## Task 4: Render the block highlight (per-cell renderer)

**Files:**
- Modify: `src/editor/render.ts`
- Test: `tests/editor-render.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-render.test.ts`)

```ts
import { orderedBlock } from "../src/editor/state";

describe("block highlight rendering", () => {
  it("wraps the marked block region in a block span", () => {
    const s = {
      ...createEditorState("abcdef"),
      cursor: { line: 0, col: 6 }, // keep cursor out of the block for a clean assertion
      blockStart: { line: 0, col: 1 },
      blockEnd: { line: 0, col: 4 },
    };
    const html = renderEditor(s);
    expect(html).toContain('<span class="block">bcd</span>');
  });

  it("does not render the highlight when hideBlock is true", () => {
    const s = {
      ...createEditorState("abcdef"),
      cursor: { line: 0, col: 6 },
      blockStart: { line: 0, col: 1 },
      blockEnd: { line: 0, col: 4 },
      hideBlock: true,
    };
    expect(renderEditor(s)).not.toContain('class="block"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-render.test.ts`
Expected: FAIL — no block span produced.

- [ ] **Step 3: Rework the renderer** in `src/editor/render.ts`

Replace the existing `renderLine` and `renderEditor` with a per-cell implementation. Keep `escapeHtml` (and its comment) as-is. Add the import:
```ts
import { orderedBlock } from "./state";
```

```ts
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
  block: { start: { line: number; col: number }; end: { line: number; col: number } } | null,
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
  const status = `${filename}   PAGE 1 LINE ${cursor.line + 1} COL ${cursor.col + 1}   ${modeLabel}`;
  const block = state.hideBlock ? null : orderedBlock(state);

  const screen = document.lines
    .map((text, i) => renderLine(text, i, cursor.line, cursor.col, block))
    .join("\n");

  return (
    `<div class="status" data-testid="status">${escapeHtml(status)}</div>` +
    `<pre class="screen" data-testid="screen">${screen}</pre>`
  );
}
```

> Note: this changes `renderEditor` to take block state into account but preserves prior behavior when no block is set: lines with no cursor/block emit as a single escaped raw run, and the cursor cell still renders as `<span class="cursor">…</span>` (including the end-of-line space cell). The existing render tests remain valid.

- [ ] **Step 4: Run the render tests AND the full suite**

Run: `npx vitest run tests/editor-render.test.ts`
Expected: PASS (prior render tests plus 2 new).

Run: `npm test`
Expected: ALL unit tests pass (document + editor-state + editor-render).

- [ ] **Step 5: Add block highlight styling** in `src/style.css`

Append:
```css
/* Marked block (^KB/^KK) highlight. */
.block {
  background: #264f78;
  color: #ffffff;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/editor/render.ts tests/editor-render.test.ts src/style.css
git commit -m "feat: render block highlight with a per-cell renderer"
```

---

## Task 5: Playwright e2e for block operations

**Files:**
- Create: `tests/editor-blocks.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";

test("mark a block, copy it to end of line, and see it duplicated", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("abc");
  // ^Q S -> start of line, mark block begin
  await page.keyboard.press("Control+q");
  await page.keyboard.press("s");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("b");
  // ^Q D -> end of line, mark block end
  await page.keyboard.press("Control+q");
  await page.keyboard.press("d");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("k");
  // cursor already at end of line; copy block here
  await page.keyboard.press("Control+k");
  await page.keyboard.press("c");

  await expect(screen).toContainText("abcabc");
});

test("mark a block and delete it", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("hello");
  // mark from start
  await page.keyboard.press("Control+q");
  await page.keyboard.press("s");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("b");
  // move right twice (^D ^D) and mark end -> block covers "he"
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("k");
  // delete block
  await page.keyboard.press("Control+k");
  await page.keyboard.press("y");

  await expect(screen).toContainText("llo");
});
```

- [ ] **Step 2: Run the e2e**

Run: `npx playwright test tests/editor-blocks.spec.ts`
Expected: 2 tests pass (Vite dev server auto-starts on port 5273 via the webServer config).

- [ ] **Step 3: Full verification**

Run:
```bash
npm test
npx tsc --noEmit
npm run build
npx playwright test
```
Expected: all unit tests pass; tsc exit 0; build succeeds; all Playwright tests pass (the prior editor.spec.ts plus the 2 new block tests).

- [ ] **Step 4: Commit**

```bash
git add tests/editor-blocks.spec.ts
git commit -m "test: e2e coverage for block copy and delete"
```

---

## Task 6: Arrow-key movement alternates

WordStar bound the diamond to Ctrl+letters, which works on any layout but is spatially awkward on non-QWERTY keyboards (e.g. AZERTY relocates `^A`/`^Q`). Per the project decision, we keep faithful letter-binding AND add arrow keys as modern movement alternates. Arrow keys map to the same character moves as the diamond (`^S`/`^D`/`^E`/`^X`).

**Files:**
- Modify: `src/editor/state.ts`
- Modify: `src/main.ts`
- Test: `tests/editor-state.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-state.test.ts`)

```ts
describe("arrow-key movement alternates", () => {
  it("ArrowRight / ArrowLeft move like ^D / ^S", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "ArrowRight", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 1 });
    s = applyKey(s, { key: "ArrowLeft", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });
  it("ArrowDown / ArrowUp move like ^X / ^E", () => {
    let s = createEditorState("ab\ncd");
    s = applyKey(s, { key: "ArrowDown", ctrl: false });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
    s = applyKey(s, { key: "ArrowUp", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });
  it("arrow keys do not insert text", () => {
    let s = createEditorState("");
    s = applyKey(s, { key: "ArrowRight", ctrl: false });
    expect(s.document.lines).toEqual([""]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: FAIL — arrow keys fall through to no-op / get inserted is prevented but cursor doesn't move.

- [ ] **Step 3: Handle arrow keys in `applyKey`** in `src/editor/state.ts`

Add this branch in `applyKey` immediately BEFORE the `isPrintable(ev)` check (after the ctrl diamond/word block):
```ts
  // Arrow keys are modern alternates for the diamond's character moves.
  const ARROWS: Record<string, string> = {
    ArrowUp: "e",
    ArrowDown: "x",
    ArrowLeft: "s",
    ArrowRight: "d",
  };
  if (!ev.ctrl && ev.key in ARROWS) {
    const moved = moveDiamond(state, ARROWS[ev.key]!);
    if (moved) return moved;
  }
```

- [ ] **Step 4: Allow arrow keys through in `src/main.ts`**

Extend the `NAMED` set so the handler intercepts arrows (otherwise the browser scrolls the page):
```ts
  const NAMED = new Set(["Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
```

- [ ] **Step 5: Run the unit tests and full verification**

Run: `npx vitest run tests/editor-state.test.ts`
Expected: PASS (prior tests plus 3 new).

Run:
```bash
npm test
npx tsc --noEmit
npm run build
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/editor/state.ts src/main.ts tests/editor-state.test.ts
git commit -m "feat: arrow-key movement alternates for the diamond"
```

---

## Self-Review

**Spec coverage (Stage 2b portion):** `^K` block command family (spec §4.2; retrospective §7) — mark begin/end (`^KB`/`^KK`), copy (`^KC`), delete (`^KY`), hide/show (`^KH`), with on-screen highlight (spec §4.3) ✓. Reducer stays pure; multi-line text handled by new model helpers `getRange`/`insertMultiline` ✓. Playwright covers the real experience ✓. Explicitly deferred and NOT present: `^KV` move, column blocks, file read/write blocks, `^O`/`^P`, menus, help levels, ruler/flag column, word-wrap/`^B`, undo/redo.

**Placeholder scan:** No TBD/TODO/vague steps; every code step shows complete code; every command lists expected output.

**Type consistency:** `Pending` extended to `"quick" | "block"`; `EditorState` gains `blockStart`/`blockEnd`/`hideBlock` (set in `createEditorState`, used in `resolveBlock`, `orderedBlock`, and the renderer). `orderedBlock` is exported from `state.ts` and imported by `render.ts`. New model functions `getRange(doc,start,end)` and `insertMultiline(doc,at,text) -> {document,end}` match their call sites in `copyBlock`. `copyBlock`/`deleteBlock`/`resolveBlock`/`orderedBlock` are each defined once.

**Branch-order note for the executor:** keep `applyKey`'s order — pending resolution (quick/block) first, then the `^Q` and `^K` triggers, then `^V`, Enter/Backspace/`^G`, the ctrl diamond/word block, and finally printable input.

**Rendering-compatibility note:** the renderer rewrite must preserve the Stage 2a render tests — a line with neither cursor nor block emits as one escaped run; the cursor cell (including the end-of-line space) still emits `<span class="cursor">…</span>`. The new `inBlock`/`cellsToHtml` logic only adds `block` spans where a block is active and not hidden.
```

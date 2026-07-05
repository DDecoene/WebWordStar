# Editor Core Remainder Implementation Plan (issue #5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Stage 2 WordStar editor core: hard/soft returns + word-wrap + `^B`, full `^O` and `^P` command sets, self-revealing menus + help levels, ruler + flag column, undo/redo, and block move `^KV`.

**Architecture:** All behavior lands in the pure reducer (`src/editor/state.ts`) and pure document/wrap modules (`src/shared/`); the renderer (`src/editor/render.ts`) grows a ruler row, flag column, styled `^P` runs, and menu panels; `main.ts` adds only the menu-reveal timer. Persistence and the WS protocol are untouched.

**Tech Stack:** TypeScript, Vitest, Playwright. Spec: `docs/superpowers/specs/2026-07-02-editor-core-remainder-design.md`.

---

### Task 1: Hard/soft return flags in the document model

**Files:** Modify `src/shared/types.ts` (TextDocument gains `returns: ("hard"|"soft")[]`), `src/shared/document.ts` (all constructors/mutators maintain flags; `splitLine` gains a `kind` param defaulting to `"hard"`), test `tests/document.test.ts`.

- [ ] Write failing tests: `createDocument` marks all breaks hard (returns.length === lines.length, last "hard"); `splitLine(..., "soft")` records soft; `deleteRange` across lines drops the removed breaks; `insertMultiline` inserts hard breaks; `getText` unchanged.
- [ ] Run `npm test` — expect failures.
- [ ] Implement: `returns[i]` describes the break after `lines[i]`; last entry always `"hard"`. Update `createDocument`, `deleteRange`, `splitLine`, `insertMultiline` (insertText/getRange/getText need no flag logic beyond passing doc through).
- [ ] Fix any compile fallout in `state.ts` (splitLine call sites unchanged — default param).
- [ ] `npm test` green. Commit `feat: hard/soft return flags in document model`.

### Task 2: Undo/redo (chunked) — `^U` / `^QU`

**Files:** Modify `src/editor/state.ts` (add `history: {undo: HistorySnapshot[]; redo: HistorySnapshot[]}`, `lastEdit: "type"|"backspace"|null` for coalescing; `HistorySnapshot = {document, cursor}`), test `tests/editor-state.test.ts`.

- [ ] Failing tests: typing 3 chars then `^U` restores original doc+cursor (one step); backspaces coalesce separately from typing; movement seals a chunk; `^QU` redoes; new edit clears redo; cap 200.
- [ ] Implement: helper `withHistory(state, next, editKind)` — pushes snapshot unless coalescing with same `editKind`; route typeChar/backspace/deleteForward/Enter/block-ops/^B/^O edits through it; `^U`/`^QU` in applyKey/resolveQuick.
- [ ] `npm test` green. Commit `feat: multi-level undo/redo (^U, ^QU)`.

### Task 3: Block move `^KV`

**Files:** Modify `src/editor/state.ts` (`resolveBlock` case "v" → `moveBlock`), test `tests/editor-state.test.ts`.

- [ ] Failing tests: move forward (dest after block), move backward (dest before block), cursor inside block is a no-op, markers clear after move.
- [ ] Implement `moveBlock`: no-op if cursor within [start,end); compute text via `getRange`; delete source first, then insert at the cursor position adjusted for the deletion when the cursor follows the block.
- [ ] `npm test` green. Commit `feat: block move ^KV`.

### Task 4: Ruler state + `^O` command set

**Files:** Modify `src/editor/state.ts` (add `Ruler` interface + `ruler` to state; `pending` gains `"onscreen"`; numeric prompts reuse `prompt` with a `target` discriminator: `prompt: {label, buffer, target: "filename"|"leftMargin"|"rightMargin"|"spacing"|"helpLevel"}`), test `tests/editor-state.test.ts`.

- [ ] Failing tests: defaults (left 0, right 65, tabs [5,10,...], spacing 1, justify off, wrap on, ruler shown); `^OL`/`^OR` prompt + numeric commit (1-based input → 0-based stored; left ≥ right rejected); `^OJ`/`^OW`/`^OT`/`^OD` toggles; `^OC` centers current line between margins; `^OI`/`^ON` set/clear tab at cursor col; `^OS` spacing 1–9; `^OX` sets marginRelease; `^OG` sets tempIndent to next tab stop, cleared by Enter.
- [ ] Implement `resolveOnscreen(state, key)` mirroring `resolveQuick`; `applyPromptKey` switches on `prompt.target` for commit semantics.
- [ ] `npm test` green. Commit `feat: ruler state and full ^O onscreen-format commands`.

### Task 5: Word-wrap engine + `^B`

**Files:** Create `src/shared/wrap.ts`; modify `src/editor/state.ts` (typeChar wrap hook, `^B`), tests `tests/wrap.test.ts`, `tests/editor-state.test.ts`.

- [ ] Failing tests for `wrap.ts`: `wrapPoint(line, right)` returns last break ≤ right (space; `\x0F` non-breaking; long word breaks at margin); `reflowParagraph(doc, fromLine, ruler, pos)` joins soft-run through next hard return, re-wraps to margins, justifies when `ruler.justify`, maps `pos` through.
- [ ] Failing reducer tests: typing past right margin wraps current word to a soft-return line at `ruler.left` (+tempIndent), cursor follows; `^OX` suppresses one wrap; `^B` reflows paragraph from cursor line.
- [ ] Implement; control chars (\x02 etc. except \x0F) are zero-width for margin math.
- [ ] `npm test` green. Commit `feat: word wrap and ^B paragraph reflow`.

### Task 6: `^P` print controls + styled rendering + `^OD`

**Files:** Modify `src/editor/state.ts` (`pending: "print"`; `resolvePrint` inserts control char), `src/editor/render.ts` (marker-aware runs; shown vs hidden modes), tests `tests/editor-state.test.ts`, `tests/editor-render.test.ts`.

- [ ] Failing tests: `^PB` inserts `\x02` at cursor (cursor +1); mapping for B/S/Y/D/X/T/V/O per spec table. Render: shown mode displays `^B` inverse (span class `ctrl`) and styles text between pairs (`fmt-bold` etc.); hidden mode (`showControls: false` via `^OD`) omits marker cells and still styles; cursor column maps correctly in both modes.
- [ ] Implement render: per line, scan chars; markers toggle active-style set; emit cells with class list; extend `CellClass` to a string of classes.
- [ ] `npm test` green. Commit `feat: full ^P print controls with styled rendering and ^OD`.

### Task 7: Ruler line + flag column

**Files:** Modify `src/editor/render.ts`, test `tests/editor-render.test.ts`.

- [ ] Failing tests: ruler row `data-testid="ruler"` shows `L`, `!` at tab stops, `R` at right margin; hidden when `showRuler` false; each screen row ends with flag cell (`<` hard, blank soft).
- [ ] Implement; `renderLine` gains the line's return flag.
- [ ] `npm test` green. Commit `feat: ruler line and flag column`.

### Task 8: Help levels, `^J`, self-revealing menus

**Files:** Create `src/editor/menus.ts` (static command tables per prefix); modify `src/editor/state.ts` (`helpLevel: 0|1|2|3` default 3; `pending: "help"`; `^JH` prompts for level), `src/editor/render.ts` (`renderEditor(state, opts?: {revealMenu?: boolean})` draws menu panel when pending+reveal+helpLevel≥2), `src/main.ts` (800 ms timer on pending → repaint with reveal), tests `tests/editor-state.test.ts`, `tests/editor-render.test.ts`.

- [ ] Failing tests: `^JH` prompt sets level 0–3 (invalid rejected); render shows `data-testid="menu"` listing ^K commands when pending "block" + reveal + level 3; no menu at level 1.
- [ ] Implement; menu tables cover ^Q/^K/^O/^P/^J entries.
- [ ] `npm test` green. Commit `feat: help levels and self-revealing menus`.

### Task 9: Playwright e2e coverage

**Files:** Create `tests/editor-core.spec.ts`.

- [ ] Cases: wrap-as-you-type + `^B`; `^OR` margin + `^OC` center + `^OT` ruler toggle; `^PB` bold rendering + `^OD` raw toggle; menu appears after delay at level 3 (and not after `^JH`→1); undo/redo round-trip; `^KV` move. Assert on `data-testid` content.
- [ ] `npx playwright test` green. Commit `test: e2e coverage for editor core remainder`.

### Task 10: DoD docs + PR

- [ ] Update `CHANGELOG.md` (v1.0.0 Added), `README.md` + `CLAUDE.md` command tables/roadmap, retake screenshot (`docs/screenshots/`).
- [ ] `npm test` + `npx playwright test` green; commit docs; push branch (HTTPS remote per memory); open PR to `release/v1.0.0` (no AI attribution).

# Layout Dot Commands Implementation Plan (issue #6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse, apply, and render the layout dot-command subset (`.lm .rm .pl .mt .mb .he .fo .pa .cp .ls .pn .op`) with positional layout override and full on-screen pagination.

**Architecture:** Dot-command lines are plain text lines starting with `.`. Two new pure modules derive everything: `src/shared/dot.ts` (parse + positional layout scan) and `src/shared/page.ts` (pagination). The reducer uses the effective (positional) ruler for wrap/`^B`/`^OC`; the renderer draws `.` flags, dimmed dot lines, page-break rows, effective ruler, and a real PAGE number. Nothing is stored — all derived per repaint/keystroke.

**Tech Stack:** TypeScript, Vitest, Playwright. Spec: `docs/superpowers/specs/2026-07-02-dot-commands-design.md`.

---

### Task 1: Dot-command parser + positional layout scan (`src/shared/dot.ts`)

**Files:** Create `src/shared/dot.ts`; test `tests/dot.test.ts`.

- [ ] Write failing tests: `isDotLine`; `parseDotLine` full table — `.lm 5` → {kind:"lm", value:5}; case/space tolerance (`.LM  5`); `.pa`/`.op` no-arg; `.pn 12`; `.cp 4`; `.he text`/`.fo text` capture the remainder verbatim (single leading space stripped); missing/invalid arg → {kind:"unknown"}; non-dot line → null.
- [ ] Write failing tests for `scanLayout(doc, uptoLine, base)`: base passthrough with no dot lines; `.lm/.rm/.ls` override from their line down (command on line k affects uptoLine > k, not ≤ k); chained same-kind overrides; margin values 1-based in text → 0-based in Layout; invalid combos (left ≥ right) ignored at fold time; `.he/.fo/.pn/.op/.pl/.mt/.mb` folded into Layout fields; defaults pl 66, mt 3, mb 8.
- [ ] Implement per the spec's DotCommand/Layout/BaseSettings interfaces.
- [ ] `npx vitest run` green; `npx tsc --noEmit` clean. Commit `feat: dot-command parser and positional layout scan`.

### Task 2: Pagination (`src/shared/page.ts`)

**Files:** Create `src/shared/page.ts`; test `tests/page.test.ts`.

- [ ] Failing tests: page text height = pl − mt − mb (55 default); doc shorter than a page → no breaks, all pageOfLine 0; doc longer → break at height boundary; dot lines occupy zero height; `.pa` forces break; `.cp n` breaks early when < n lines remain, no-op otherwise; `.ls 2` doubles line height; `.pn 5` renumbers current page (pageNumbers), `.op` sets a flag surfaced in the result; mid-doc `.pl` applies from the next page.
- [ ] Implement `paginate(doc, base): {breaks, pageOfLine, pageNumbers, omit: boolean[]}` per spec (breaks = last line of each non-final page).
- [ ] `npx vitest run` green. Commit `feat: on-screen pagination from layout dot commands`.

### Task 3: Reducer — effective ruler + dot-line boundaries

**Files:** Modify `src/editor/state.ts`; test `tests/editor-state.test.ts`.

- [ ] Failing tests (describe "dot commands in editor"): with `.rm 20` on line 0, typing on line 1 wraps at col 20 while `state.ruler.right` stays 65; `^B` below a dot line reflows only down to/up to dot-line boundaries (dot line never merged into the paragraph); typing on a dot line never wraps; `^OC` centers using effective margins.
- [ ] Implement: `effectiveRuler(state)` (scanLayout at cursor.line over the ^O base); use it in typeChar's wrap check, reflow (`^B`), and centerLine; make wrap/reflow treat dot lines as hard boundaries (paragraphStart stops after a dot line; reflow range excludes dot lines; a dot line itself is never wrapped).
- [ ] `npx vitest run` green. Commit `feat: dot commands positionally override ruler for wrap/reflow/center`.

### Task 4: Rendering — flags, dimmed dot lines, page breaks, real PAGE

**Files:** Modify `src/editor/render.ts`, `src/style.css`; test `tests/editor-render.test.ts`.

- [ ] Failing tests (describe "dot command rendering"): dot line's flag cell is `.` (beats `<`); dot line cells carry class `dot`; a doc with `.pa` between paragraphs renders a `data-testid="page-break"` row (dashes to right margin, flag `P`) after the break line; status shows `PAGE 2` when cursor is below the break; `.pn 5` makes it `PAGE 5`; ruler row uses effective margins at the cursor (e.g. R at col from `.rm`).
- [ ] Implement in renderEditor: call scanLayout (for ruler row) and paginate (for break rows + PAGE); insert page-break rows into the screen HTML between lines; `.dot` and `.page-break` CSS consistent with the terminal aesthetic.
- [ ] `npx vitest run` green. Commit `feat: render dot lines, page breaks, and real page numbers`.

### Task 5: Playwright e2e

**Files:** Create `tests/dot-commands.spec.ts`.

- [ ] Cases: type `.rm 20` Enter then a long sentence → wrapped within 20 cols; type `.pa` on its own line then text → page-break row visible and status shows PAGE 2 with cursor below; the `.rm` line shows `.` flag and dimmed class.
- [ ] `npx playwright test` all green (existing + new). Commit `test: e2e coverage for layout dot commands`.

### Task 6: DoD docs + PR

- [ ] `CHANGELOG.md` (Added under v1.0.0), `README.md` + `CLAUDE.md` (dot-command table + roadmap check `#6`), retake screenshot showing a dot line + page break.
- [ ] `npx vitest run` + `npx playwright test` green; commit docs; push (HTTPS remote workaround); PR to `release/v1.0.0`, body `Closes #6`, no AI attribution.

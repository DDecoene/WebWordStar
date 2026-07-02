# Stage 3 layout dot commands — design (issue #6)

Date: 2026-07-02 · Milestone: v1.0.0 · Branch: `feature/dot-commands` off `release/v1.0.0`

Parse, apply, and render the layout dot-command subset:
`.lm .rm .pl .mt .mb .he .fo .pa .cp .ls .pn .op` — with full on-screen pagination.
MailMerge templating is deferred to v1.1.0. Headers/footers are parsed and carried for
export (#9) but not drawn in the editor.

## 1. Model — dot lines are text

A line whose first character is `.` is a **dot-command line**. It stays in `document.lines`,
so persistence, block operations, and undo need no changes.

New pure module `src/shared/dot.ts`:

```ts
export type DotCommand =
  | { kind: "lm" | "rm" | "ls" | "pl" | "mt" | "mb" | "cp"; value: number }
  | { kind: "pn"; value: number | "off" }   // ".pn off" is not classic; ".op" handles omit — see below
  | { kind: "pa" | "op" }
  | { kind: "he" | "fo"; text: string }
  | { kind: "unknown" };

export function isDotLine(text: string): boolean;      // first char is "."
export function parseDotLine(text: string): DotCommand | null; // null if not a dot line
```

Parsing is case-insensitive and tolerant of extra spaces (`.LM  5` works). A dot line whose
command or argument is unrecognized/invalid parses to `{kind: "unknown"}` (rendered like any
dot line; no effect). `.pn` takes a positive integer only; `.op` (omit page numbers) is its
own command. Margin values in dot commands are 1-based columns (like the ^O prompts) and are
stored 0-based in layout state.

## 2. Effective layout — positional scan

```ts
export interface Layout {
  left: number; right: number; spacing: number;     // override the ^O ruler from their line down
  pageLen: number; marginTop: number; marginBottom: number; // defaults 66 / 3 / 8
  header: string; footer: string;                   // last .he/.fo seen; "" default
  pageNumber: number | null;                        // .pn value at this point, null = default numbering
  omitPageNumbers: boolean;                         // .op seen
}

export function scanLayout(doc: TextDocument, uptoLine: number, base: BaseSettings): Layout;
```

`base` comes from the `^O` ruler (left/right/spacing) plus page defaults. Dot commands on
lines **before** `uptoLine` are folded top-down; a `.lm/.rm/.ls` overrides the base from its
line down until the next same-kind dot command. Invalid values (e.g. left ≥ right) are
ignored at fold time.

Reducer integration (`src/editor/state.ts`):
- `effectiveRuler(state)` = ruler with left/right/spacing replaced by `scanLayout(doc, cursor.line, ...)`.
- Wrap-as-you-type, `^B`, and `^OC` use the effective margins/spacing at the cursor's line.
- Dot-command lines never wrap and act as hard paragraph boundaries for `^B` (reflow stops
  before a dot line; typing on a dot line never triggers wrap).

## 3. Pagination — `src/shared/page.ts`

```ts
export interface Pagination { breaks: number[]; pageOfLine: number[]; pageNumbers: number[] }
export function paginate(doc: TextDocument, base: BaseSettings): Pagination;
```

- Text height per page = `pl − mt − mb` (with current `.pl/.mt/.mb` in effect; changes apply
  from the next page).
- Dot-command lines occupy zero page height.
- `.pa` forces a page break after that point; `.cp n` breaks if fewer than n text lines remain.
- `.ls n` makes each text line occupy n rows of page height.
- `.pn n` renumbers the current page to n; `.op` marks numbering omitted (`pageNumbers` still
  computed; the status line shows the page regardless — `.op` matters for print/export).
- `breaks` lists the last document line of each page (except the final page); `pageOfLine[i]`
  is the 0-based page index of line i; `pageNumbers[p]` the displayed number of page p.

Derived, not stored: the renderer and status line call `paginate` per repaint; the reducer
calls `scanLayout` on wrap paths. O(doc) per keystroke is acceptable at this scale.

## 4. Rendering (`src/editor/render.ts`)

- **Flag column:** `.` for dot-command lines (takes precedence over `<`); `P` on the
  page-break row.
- **Page-break row:** after the last text row of each page, a dashed full-width row
  (`data-testid="page-break"`, `-` repeated to the right margin, flag `P`, CSS class `page-break`).
- **Status line:** `PAGE n` becomes real — `pageNumbers[pageOfLine[cursor.line]]`. LINE stays
  the absolute document line (no change).
- **Ruler row:** reflects the effective margins/tab display at the cursor (positional).
- **Dot lines:** rendered dimmed (CSS class `dot` on the line's cells).

## 5. Testing

- **Vitest:** parser table (all 12 commands, case/space tolerance, invalid → unknown);
  scanLayout precedence (base ^O overridden from dot line down, same-kind override chains,
  invalid ignored); paginate (heights, `.pa`, `.cp`, `.ls`, `.pn`, `.op`, dot lines zero-height,
  mid-document `.pl` applying next page); reducer (wrap honors `.rm` below it, `^B` stops at dot
  lines, `^OC` centers with effective margins).
- **Playwright (`tests/dot-commands.spec.ts`):** typing `.rm 20` then a paragraph wraps at 20;
  `.pa` produces a page-break row and status shows PAGE 2 below it; dot line shows `.` flag and
  dimmed rendering.

## Out of scope

- Drawing headers/footers in the editor (export #9 consumes `header`/`footer`).
- MailMerge dot commands (v1.1.0). Print-time behavior of `.op`/`.pn` beyond status display.

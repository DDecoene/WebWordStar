# Stage 2 editor core remainder — design (issue #5)

Date: 2026-07-02 · Milestone: v1.0.0 · Branch: `feature/editor-core-remainder` off `release/v1.0.0`

Completes issue #5: hard/soft returns + word-wrap + `^B`, full `^O` onscreen-format menu,
full `^P` print controls (embedded control chars), self-revealing menus + help levels,
ruler line + flag column, multi-level undo/redo, block move `^KV`.

## 1. Document model — hard/soft returns

`TextDocument` gains a parallel per-line return flag:

```ts
interface TextDocument {
  lines: string[];
  returns: ("hard" | "soft")[]; // returns[i] describes the break after lines[i]; last entry is "hard"
}
```

All pure functions in `src/shared/document.ts` maintain the flags:
- `splitLine` (Enter) creates a **hard** return.
- Wrapping creates a **soft** return.
- Deleting a line break (backspace at col 0 / ^G at EOL / deleteRange across lines) removes that break's flag.

**Persistence is unchanged.** `getText` serializes both kinds as `\n`; `createDocument` marks all
loaded returns hard. Soft/hard distinction is a session-local editing convenience re-established by
typing and `^B`. No DB schema or WS protocol change.

## 2. Word-wrap + `^B` — `src/shared/wrap.ts`

New pure module:
- `wrapPosition(line, ruler)` — find the wrap point at/before the right margin (last space ≤ right;
  a single word longer than the margin breaks at the margin).
- `reflowParagraph(doc, fromLine, ruler, trackedPos)` — join lines `fromLine..next hard return`
  (soft breaks become single spaces), re-wrap to `ruler.left..ruler.right`, apply justification if
  on, and return the new doc plus the tracked position mapped through the reflow.

Behavior:
- Typing a character that pushes the cursor past `ruler.right` (with word-wrap on) eagerly wraps the
  current word to a new soft-return line, cursor following it. New lines start at `ruler.left`.
- `^B` reflows from the cursor's line to the next hard return; cursor tracks its character.
- Justification (`^OJ` on) pads spaces between words on **soft-return** lines only, at wrap time.

## 3. Ruler state + `^O` commands

`EditorState.ruler`:

```ts
interface Ruler {
  left: number;      // default 0
  right: number;     // default 65
  tabs: number[];    // default every 5 columns
  spacing: number;   // default 1 (rendering: blank rows between lines when > 1 is deferred; stored + shown in status)
  justify: boolean;  // default false
  wordWrap: boolean; // default true
  showRuler: boolean;// default true
}
```

Commands (prefix `^O`, second key with or without ctrl, like `^Q`/`^K`):

| Key | Action |
|---|---|
| `^OL` / `^OR` | Set left / right margin — inline prompt (`LEFT MARGIN:` / `RIGHT MARGIN:`), numeric |
| `^OC` | Center current line between margins |
| `^OS` | Set line spacing — prompt, 1–9 |
| `^OJ` | Toggle justification |
| `^OW` | Toggle word-wrap |
| `^OT` | Toggle ruler line |
| `^OI` / `^ON` | Set / clear tab stop at cursor column |
| `^OX` | Margin release — next wrap check suppressed for the current line |
| `^OG` | Temporary paragraph indent: left margin advances to the next tab stop until the next hard return is created |
| `^OD` | Toggle print-control display (styled vs raw markers) |

Prompt handling reuses the existing `prompt` mechanism with numeric validation (non-numeric commit
= no-op). Invalid margins (left ≥ right) are rejected (prompt no-op).

## 4. `^P` print controls — embedded control characters

Toggling a `^P` command inserts one control character at the cursor (it lives in the text; block
ops, undo, and persistence treat it as any character):

| Keys | Style | Char |
|---|---|---|
| `^PB` | Bold | `\x02` |
| `^PS` | Underline | `\x13` |
| `^PY` | Italic | `\x19` |
| `^PD` | Double-strike (rendered bold-dim) | `\x04` |
| `^PX` | Strikeout | `\x18` |
| `^PT` | Superscript | `\x14` |
| `^PV` | Subscript | `\x16` |
| `^PO` | Non-break space | `\x0F` (renders as space, never a wrap point) |

Rendering (`render.ts`): per line, markers toggle CSS classes for the run until the matching marker
(or end of line). Two display modes (`^OD`):
- **Shown** (default, faithful): each marker occupies one column rendered inverse-video as `^B`,
  `^S`, … styled text between markers.
- **Hidden**: markers occupy zero display columns; text is styled. Cursor movement still steps over
  them (document columns ≠ display columns; the renderer maps).

Wrap treats control chars as zero-width for margin math except `\x0F` (width 1, non-breaking).
SQLite stores them verbatim (TEXT handles control chars fine).

## 5. Self-revealing menus + help levels

- `helpLevel: 0 | 1 | 2 | 3` in `EditorState`, default 3.
- `^J` opens the help menu; `^JH` prompts for a new help level (0–3).
- At help level ≥ 2, a pending prefix (`^Q`, `^K`, `^O`, `^P`, `^J`) that stays pending ~800 ms
  reveals its menu panel. Menus are rendered by `render.ts` from a static command table
  (`src/editor/menus.ts`). The delay timer lives in `main.ts`: on entering a pending state it
  schedules a repaint with `revealMenu: true` passed to the renderer — the reducer stays pure
  (`EditorState.pending` is the only state; reveal is view-level).
- At help level 3 the status line additionally shows edit-menu hints.
- Levels 0–1: never show menus.

## 6. Ruler line + flag column (`render.ts`)

- Ruler row under the status line (when `showRuler`): `L`, `-`, `!` at tab stops, `R`, spanning
  left→right margin.
- Flag column: one extra rightmost column per text row — `<` for hard return, blank for soft,
  `·` for rows past end of document.

## 7. Undo / redo

```ts
history: { undo: Snapshot[]; redo: Snapshot[] }   // Snapshot = { document, cursor }
```

- **Chunked by run:** consecutive printable typing or consecutive backspaces coalesce into one undo
  step; any command, cursor movement, Enter, or ^G seals the chunk. Implementation: push a snapshot
  when a document-mutating action starts and the previous action wasn't a coalescable same-kind run.
- Cap 200 snapshots (drop oldest).
- `^U` = undo, `^QU` = redo (no faithful redo binding exists; `^QU` chosen).
- Any new document mutation clears the redo stack. Undo/redo restore document + cursor, not
  block markers or ruler settings.

## 8. Block move `^KV`

Like `^KC` but removes the source block after inserting at the cursor. When the destination
precedes the source, delete-then-insert ordering keeps positions correct (compute in document
order). Cursor ends at the end of the inserted text; markers clear.

## Testing

- **Vitest:** wrap/reflow (margins, long words, justify, ^OX/^OG), return-flag maintenance,
  ^O command table + prompts, ^P marker insertion + display-width mapping, undo chunk semantics,
  ^KV including overlap/ordering cases, help level state.
- **Playwright (one per user-facing group, per DoD):** wrap-as-you-type + `^B`; `^O` margin set +
  centered line + ruler toggle; `^P` bold rendering + `^OD` toggle; self-revealing menu appears
  after delay at level 3 and not at level 1; undo/redo round-trip; `^KV` move.

## Out of scope / deferred

- Persisting soft-return flags and ruler settings per document (session-local for now).
- Line-spacing > 1 visual rendering (stored, shown in status; rendering deferred).
- Dot commands (#6), print/export interpretation of ^P chars (#9), collaboration (#8).

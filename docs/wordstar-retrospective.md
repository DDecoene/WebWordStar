# WordStar: A Retrospective User Manual

*A field guide to what WordStar was, why it worked, what aged badly, and where WebWordStar will honour it or break from it.*

This document is the product's north star. Before we write a line of code we need a shared, honest understanding of the original: its genius, its muscle memory, and its warts. Every deviation WebWordStar makes should be a deliberate, documented choice — not an accident of not knowing the source material.

---

## 1. Historical context

WordStar was written principally by **Rob Barnaby** at **MicroPro International** (founded by **Seymour Rubinstein**) and released in **1978** for the **CP/M** operating system, later ported to **MS-DOS/PC-DOS**. Through the early 1980s it was *the* word processor — the dominant writing tool of the 8-bit and early 16-bit era, before WordPerfect and then Microsoft Word displaced it.

Key facts that shape its design:

- **It predates the mouse, arrow keys, and reliable function keys.** Early CP/M terminals and keyboards could not be relied upon to have cursor keys. So *every* action had to be reachable from the standard typewriter keys, using the **Control** modifier. This single constraint produced WordStar's entire command language — and, paradoxically, its enduring appeal.
- **It was disk-based, not memory-bound.** WordStar could edit documents larger than available RAM by paging to disk — remarkable for the era.
- **It shipped with overlay files** (`WSOVLY1.OVR`, `WSMSGS.OVR`, etc.) that had to be present on disk; the editor loaded command code on demand.
- **The famous holdouts.** WordStar 4.0 retains a devoted following decades later — most famously the novelist **George R. R. Martin**, who cites the absence of autocorrect, network, and distraction as features, not bugs.

Later history matters for scoping: **WordStar 2000** (1984) was a ground-up rewrite with a *different* command set and was poorly received; the community stayed on the classic line. **WordStar 7.0** (1992) was the last DOS release. There was also a **WordStar for Windows**. **WebWordStar is faithful to the classic DOS line (roughly 4.0–7.0), not WordStar 2000.**

---

## 2. Design philosophy — why it worked

The thesis WebWordStar inherits: **these interfaces were already correct.**

- **Hands never leave the home row.** A touch typist never reaches for a mouse or an arrow key. Cursor movement, deletion, formatting, file operations — all happen under the fingers. For a fast writer this is a genuine speed and flow advantage, not nostalgia.
- **The command language is *spatial*, not mnemonic-only.** The cursor "diamond" (see §4) is laid out by physical key position, so it's learned by the hand, not memorised as text.
- **Modeless editing.** Unlike `vi`, WordStar has no separate "command mode" — you are always typing text, and Control-chords issue commands inline. There is no mode error.
- **Progressive disclosure via help levels.** Beginners saw full menus; experts turned them off to reclaim the screen. The same key sequences worked at every level (see §3).
- **Self-describing.** Press a prefix key (`^K`, `^Q`, `^O`, `^P`) and pause, and a menu of what-comes-next appears. The interface teaches itself at the speed of the user.

---

## 3. Anatomy of the screen

```
 A:CHAPTER.TXT  PAGE 1 LINE 6 COL 12   INSERT ON      <- status line
-------------------------------------------------------!--- <- ruler line (margins, tabs)
   <editing area>                                      <flag column>
...
 (help / menu area, shown at lower help levels)
```

- **Status line (top).** Drive/filename, cursor position as **PAGE / LINE / COL**, and editing state (e.g. `INSERT ON`/`OFF`). This is the writer's instrument panel.
- **Ruler line.** Shows current left/right margins (`L`…`R`) and tab stops (`!`). Editable live with `^O` commands.
- **Flag column (far right).** A one-character status flag per line — one of WordStar's signature quirks (see §11).
- **Menu area.** At higher help levels, command menus occupy a chunk of the screen. At help level 0 they vanish entirely, giving a full-screen editor.

**Help levels (0–3):** `^JH` cycles them. Level 3 = full menus always; level 0 = no menus, maximum writing space. The commands never change — only how much hand-holding is shown.

**Document vs Non-Document mode:** WordStar distinguished **Document** mode (word wrap, dot commands, the high-bit file format — see §11) from **Non-Document** mode (clean ASCII, no wrap, no formatting interpretation). Non-Document mode made WordStar a popular *programmer's editor*.

---

## 4. Cursor movement — the diamond and beyond

The **WordStar diamond** is the heart of the interface. On a QWERTY keyboard, `E S D X` form a physical diamond around `S`/`D`, and the directions map to their position:

```
            ^E  (up)
   ^S (left)        ^D (right)
            ^X (down)
```

| Keys | Movement |
|---|---|
| `^E` / `^X` | Up / down one line |
| `^S` / `^D` | Left / right one character |
| `^A` / `^F` | Left / right one **word** |
| `^R` / `^C` | Up / down one **screen** (page) |
| `^W` / `^Z` | Scroll up / down one line (cursor holds position) |

The outer ring (`A R … F C`, `W Z`) extends the diamond outward to bigger jumps — again, learned by position.

**Quick movement** layers onto the diamond with the `^Q` prefix (§6): `^Q` + a diamond key = "go as far as possible in that direction." E.g. `^QS` = start of line, `^QD` = end of line, `^QE` = top of screen, `^QX` = bottom of screen, `^QR` = top of document, `^QC` = end of document.

---

## 5. Editing & typing commands

| Keys | Action |
|---|---|
| `^V` | Toggle **Insert / Overtype** mode |
| `^N` | Insert a hard return *without* moving the cursor (split line) |
| `^G` | Delete character at/right of cursor |
| `DEL` / `^H` | Delete character to the left (backspace) |
| `^T` | Delete word to the right |
| `^Y` | Delete the entire line |
| `^QY` | Delete from cursor to end of line |
| `^Q DEL` | Delete from cursor to start of line |
| `^B` | **Reform (re-wrap) the current paragraph** |
| `^L` | Repeat the last Find / Find-and-replace |
| `^I` | Tab |
| `^U` | Interrupt / undo the current operation (later versions added a true Undo) |
| `^P` *(prefix)* | Enter a print-control character into the text (§9) |

> **The `^B` reform is essential to understanding WordStar.** It did **not** automatically re-wrap a paragraph after you edited in the middle of it. You typed, the right edge went ragged, and you pressed `^B` to reflow. This is one of the biggest "icky" points for modern users (see §12).

---

## 6. Quick commands — the `^Q` prefix

`^Q` means "go far / do the big version."

| Keys | Action |
|---|---|
| `^QS` / `^QD` | Start / end of line |
| `^QE` / `^QX` | Top / bottom of screen |
| `^QR` / `^QC` | Start / end of document |
| `^QF` | **Find** (search) |
| `^QA` | **Find and replace** |
| `^QY` | Delete to end of line |
| `^QB` / `^QK` | Jump to start / end of the marked block |
| `^QP` | Return to previous cursor position |
| `^QV` | Jump to the last find / source of the last block |
| `^Q0`–`^Q9` | Jump to place marker 0–9 |
| `^QW` / `^QZ` | Continuous scroll up / down (until a key is pressed) |

---

## 7. Block & file commands — the `^K` prefix

`^K` governs blocks (selections) and files. A "block" is defined by two markers and acted on as a unit.

| Keys | Action |
|---|---|
| `^KB` | Mark **begin** of block |
| `^KK` | Mark **end** of block |
| `^KC` | **Copy** block to cursor |
| `^KV` | **Move** block to cursor |
| `^KY` | **Delete** block |
| `^KW` | **Write** block out to a disk file |
| `^KR` | **Read** a disk file in at the cursor |
| `^KH` | Hide / show block markers and highlighting |
| `^KN` | Toggle **column** (rectangular) block mode |
| `^K0`–`^K9` | Set place marker 0–9 |
| `^KS` | **Save** and resume editing |
| `^KD` | Save and **done** (back to menu) |
| `^KX` | Save and **exit** the program |
| `^KQ` | **Quit** — abandon changes |
| `^KP` | Print |
| `^KF` / `^KO` / `^KE` / `^KJ` | File ops: directory / copy / rename / delete |

---

## 8. On-screen formatting — the `^O` prefix

`^O` controls layout you can see while editing (margins, tabs, wrap, justification). These set *live* document state and the ruler.

| Keys | Action |
|---|---|
| `^OL` / `^OR` | Set left / right margin |
| `^OC` | Center the current line |
| `^OS` | Set line spacing |
| `^OG` | Temporary paragraph indent |
| `^OW` | Toggle **word wrap** |
| `^OJ` | Toggle **justification** |
| `^OF` | Set the ruler from the current line |
| `^OI` / `^ON` | Set / clear a tab stop |
| `^OX` | Margin release (type past the margin) |
| `^OP` | Toggle display of print-control characters |
| `^OD` | Toggle display of dot commands |

---

## 9. Print controls — the `^P` prefix

`^P` embeds a **print-control character** into the text. Crucially, WordStar was **not WYSIWYG**: bold text showed as `^B…^B` markers inline, not as actual bold glyphs. The toggles come in pairs (one to turn on, one off).

| Keys | Effect |
|---|---|
| `^PB` | **Bold** |
| `^PS` | Underline |
| `^PD` | Double-strike |
| `^PX` | Strikeout |
| `^PV` / `^PT` | Subscript / superscript |
| `^PY` | Italics (printer-dependent; "custom" font) |
| `^PA` / `^PN` | Alternate / normal pitch |
| `^PH` | Overstrike a character |
| `^PO` | Non-break space |
| `^PC` | Pause printing (for manual paper/font change) |
| `^PL` | Form feed / page eject |

---

## 10. Dot commands

**Dot commands** are formatting/print directives entered as a line beginning with a period (`.`) **in column 1**. They don't print; they instruct the print formatter. They are, effectively, WordStar's markup language.

| Command | Meaning |
|---|---|
| `.lm n` / `.rm n` | Left / right margin |
| `.pl n` | Page length (lines) |
| `.mt n` / `.mb n` | Top / bottom margin |
| `.he text` / `.fo text` | Header / footer text |
| `.pa` | Unconditional page break |
| `.cp n` | Conditional page (keep next *n* lines together) |
| `.op` | Omit page numbers |
| `.pn n` | Set starting page number |
| `.pc n` | Page-number column position |
| `.ls n` | Line spacing |
| `.lh n` | Line height (in 1/48") |
| `.cw n` | Character width |
| `..` or `.ig` | Comment / ignored line |
| `.pf` | Print-time reformatting on/off |

**MailMerge dot commands** (the merge/print add-on) extended this into a small templating language:

| Command | Meaning |
|---|---|
| `.df file` | Data file to read records from |
| `.rv var,var…` | Read variables from the next data record |
| `.av "prompt",var` | Ask the user for a variable at print time |
| `.fi file` | Insert (include) another file at print time |
| `.rp n` | Repeat |
| `&variable&` | Substitute a variable's value inline |
| `.if / .el / .ei` | Conditional blocks |

---

## 11. The companion "Star" family

WordStar was the hub of a product suite; features modern users expect as built-in were once separate programs:

- **MailMerge** — merge/print, the dot-command templating above.
- **SpellStar** — spell checking (later folded into WordStar as `^QL`/`^QN`).
- **StarIndex** — index and table-of-contents generation.
- **DataStar / ReportStar** — data entry and reporting.
- **CalcStar** — spreadsheet.

This is useful context for scoping: WebWordStar should decide which of these belong *in core* versus as later, optional capabilities.

---

## 12. Quirks and the "icky" parts — and how we address them

A faithful homage must be honest about what genuinely frustrated people. For each, the original behaviour and WebWordStar's intended remedy.

| # | Quirk / icky thing | What it was | How WebWordStar addresses it |
|---|---|---|---|
| 1 | **Manual paragraph reform (`^B`)** | Editing mid-paragraph left a ragged right edge until you manually reflowed. | **Live re-wrap by default**, with `^B` preserved as an explicit "reform now" for muscle memory and for fidelity mode. |
| 2 | **The high-bit file format** | WordStar set bit 7 of bytes to mark soft spaces, soft hyphens, and soft returns — so `.ws` files were *not* clean ASCII and corrupted in other tools. | Store documents in a **clean structured model** (UTF-8 text + explicit formatting metadata) in SQLite. Soft/hard distinctions live in the model, never in smuggled high bits. Offer import/export that *cleans* legacy high-bit files. |
| 3 | **Non-WYSIWYG formatting** | Bold/underline showed as inline `^B`/`^S` markers; dot commands as raw lines. You couldn't see the result while writing. | **Reveal-codes-style live rendering**: show formatting applied, with an optional toggle (`^OP`/`^OD` heritage) to reveal the underlying control characters and dot commands. Best of both: see the result *and* the codes on demand. |
| 4 | **Steep learning curve** | Dozens of Control-chords with no discoverability beyond the menus. | Keep the **self-revealing prefix menus** (`^K`/`^Q`/`^O`/`^P` pause-to-show), keep **help levels**, and add a modern, searchable command palette as an *additional* path — never replacing the keyboard core. |
| 5 | **Screen real estate eaten by menus** | At high help levels, menus consumed much of the screen. | Help levels preserved; default to a clean full-screen editor with menus summoned on demand. |
| 6 | **Flag-column cryptography** | The right-edge flag characters (`<` hard return, space = soft-wrap, `+` line runs off screen, `-` soft hyphen, `^` overprint, `P` page break) were powerful but opaque to newcomers. | Keep the flag column as an **optional power-user affordance**, with hover/inspect tooltips explaining each flag, and sensible defaults that don't require decoding it to be productive. |
| 7 | **8.3 filenames / overlay files / drive letters** | CP/M-DOS heritage: cryptic `A:NAME.EXT`, `.OVR` overlays, `^KL` to change logged drive. | Gone. Documents are named freely and persisted in SQLite; no drive letters, no overlays, no `.BAK` shuffle (replaced by autosave + versioned history). |
| 8 | **No real undo (early versions)** | Limited or no multi-level undo; `^U` interrupted operations. | Full **multi-level undo/redo** as a first-class feature, which also makes the collaborative model safer. |
| 9 | **Single-user, isolated** | One writer, one machine, one file. | **Real-time multiuser collaboration** over WebSockets — the headline new capability (see §13). |
| 10 | **ASCII/codepage-bound** | Limited character set, printer-driver-specific output. | Full **Unicode/UTF-8**; rendering in the browser, not a printer driver matrix. |

---

## 13. Where WebWordStar deliberately deviates — and why

Two kinds of deviation: **additions** (new capability the original never had) and **modernisations** (changing a behaviour because the original constraint no longer exists). Faithfulness is the default; each deviation below is intentional.

| Area | WordStar (original) | WebWordStar | Why |
|---|---|---|---|
| **Collaboration** | Single user | Real-time multiuser editing via WebSockets | The defining new feature; the constraint that forced single-user (one machine, one disk) is gone. |
| **Re-wrap** | Manual `^B` | Live wrap, `^B` retained | Removes the #1 daily annoyance while preserving the gesture. |
| **File format** | High-bit `.ws` | Clean UTF-8 + structured model in SQLite | Interoperability and correctness; no smuggled bits. |
| **Rendering** | Non-WYSIWYG, printer-driven | Live rendering in a terminal-aesthetic browser UI, codes revealable on demand | We can show the result *and* keep the codes; no printer matrix to fight. |
| **Discoverability** | Menus + help levels only | Same, **plus** searchable command palette | Additive path for newcomers; the keyboard core is untouched. |
| **Persistence** | Manual `^KS`, `.BAK` files | Autosave + version history in SQLite | No lost work; enables collaboration and undo. |
| **Undo** | Minimal | Full multi-level undo/redo | Modern baseline; required for safe concurrent editing. |
| **Character set** | ASCII / codepages | Unicode | Global text. |
| **Platform** | CP/M / DOS binary | Browser (Node.js + WS + SQLite, TypeScript) | Runs anywhere, no install. |

### The sacred core — what we will NOT change

These are non-negotiable; changing them would make it "not WordStar":

1. **The diamond** (`^E^S^D^X` + `^A^F^R^C^W^Z`) — exact key positions.
2. **The four command prefixes** `^K` (block/file), `^Q` (quick), `^O` (on-screen), `^P` (print) with their classic sub-letters.
3. **Modeless editing** — no separate command mode; you're always typing.
4. **Dot commands** in column 1 as the formatting/markup language.
5. **Self-revealing prefix menus** and **help levels** — progressive disclosure.
6. **Keyboard-first** — every action reachable from the home row; the mouse is never *required*.

> Modernisation is allowed at the edges and underneath. The *grammar of interaction* is preserved exactly. When in doubt, default to faithful and make the modern behaviour opt-in.

---

## 14. Open questions for scoping (to resolve in the v1.0.0 spec)

- Does **real-time collaboration** ship in v1.0.0, or is v1.0.0 a faithful single-user editor with collaboration in v1.1.0?
- Which **dot commands** are in scope for v1.0.0 vs. later? (Layout subset vs. full MailMerge templating.)
- Is **MailMerge** core or a later milestone?
- **Print/export** target: PDF? HTML? Plain text? What does "print" mean in a browser?
- How literal is the **terminal aesthetic** — character-cell grid with the real status line, ruler, and flag column, or a modern interpretation of it?
- **Fidelity mode** toggle: should there be a strict "behave exactly like WordStar 4.0" mode (manual reform, reveal-codes always) alongside the friendlier defaults?

These are deliberately left open here; they belong in the v1.0.0 design spec, for which this retrospective is the input.
```

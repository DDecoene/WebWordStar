# Changelog

All notable changes to WebWordStar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses milestone-versioned
release branches (see `CLAUDE.md`). Nothing is tagged until a `release/vX.Y.Z` branch
merges to `main`.

## [1.0.0] — Unreleased

The first release. Work integrates on `release/v1.0.0`.

### Added

- **Foundation** — TypeScript (Vite/Vitest/Playwright, strict), a pure document
  model (`src/shared/document.ts`), shared types, and CI (`unit` + `e2e`).
- **Editor core** — keyboard-first editing with the WordStar **diamond**
  (`^E`/`^X`/`^S`/`^D`), word movement (`^A`/`^F`), the **`^Q` quick-movement**
  prefix (line/screen/document ends), insert/overtype (`^V`), and
  `Enter`/`Backspace`/`^G` editing with line joins.
- **Terminal aesthetic** — status line (title, `PAGE`/`LINE`/`COL`, `INSERT`/`OVERTYPE`),
  a blue WordStar-style status bar, a dark monospace screen, and a blinking block cursor.
- **`^K` block commands** — mark begin/end (`^KB`/`^KK`), copy (`^KC`), delete (`^KY`),
  and hide/show (`^KH`), with the marked region highlighted on screen.
- **Arrow-key movement alternates** — `↑`/`↓`/`←`/`→` mirror the diamond (helpful on
  AZERTY, where `^A`/`^Q` are physically displaced); faithful `Ctrl+letter` bindings kept.
- **Persistence (always-saved)** — a Node WebSocket server (`ws`) backed by SQLite
  (`better-sqlite3`, WAL). Documents are identified by a **UUID in the URL**
  (`?doc=<uuid>`), carry an **editable title** set via a WordStar-style `^KN` inline
  prompt, and are **continuously auto-saved** (debounced) with no save command. The
  client reconnects with backoff and buffers edits while offline.
- **Editor core remainder** — hard/soft return tracking in the document model, with a
  **ruler line** and a **flag column** (`<` marks a hard return) in the renderer;
  **word wrap** at the right margin while typing plus `^B` paragraph reflow and
  justification; the full **`^O` onscreen-format menu** (`^OL`/`^OR` margin prompts,
  `^OC` center, `^OS` line spacing, `^OJ` justify, `^OW` word-wrap toggle, `^OT` ruler
  toggle, `^OD` print-control display toggle, `^OI`/`^ON` set/clear tab, `^OX` margin
  release, `^OG` temporary paragraph indent); the full **`^P` print-control** set
  (`^PB` bold, `^PS` underline, `^PY` italic, `^PD` double-strike, `^PX` strikeout,
  `^PT` superscript, `^PV` subscript, `^PO` non-break space), stored as embedded
  WordStar control characters and rendered styled; **self-revealing menus** (~800ms)
  for the `^Q`/`^K`/`^O`/`^P`/`^J` prefixes with **help levels** 0–3 via `^J H`
  (default 3); **multi-level undo/redo** (`^U` undo, `^Q U` redo, chunked by typing
  run, 200 levels); and **block move** (`^K V`).

### Fixed

- Prevent a **path-traversal** vulnerability in the server's static file handler.
- Keyboard handling: treat AltGr correctly, guard IME composition, let browser/OS
  shortcuts (`Ctrl+C`, etc.) pass through, and scope intercepted keys to real commands.
- `^KN` title prompt UX: starts empty with a visible caret, and the document cursor is
  suppressed while the prompt is open (no double caret).
- Ctrl-key forwarding for `^O`/`^P`/`^U`/`^B` and pending-prefix keys, and a
  snapshot-race guard in `main.ts`.

### Notes

- **Latest-only** persistence for now — version history is deferred to a later milestone.
- Real-time multi-user collaboration and the full operation protocol are the next stage.

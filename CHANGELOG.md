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

### Fixed

- Prevent a **path-traversal** vulnerability in the server's static file handler.
- Keyboard handling: treat AltGr correctly, guard IME composition, let browser/OS
  shortcuts (`Ctrl+C`, etc.) pass through, and scope intercepted keys to real commands.
- `^KN` title prompt UX: starts empty with a visible caret, and the document cursor is
  suppressed while the prompt is open (no double caret).

### Notes

- **Latest-only** persistence for now — version history is deferred to a later milestone.
- Real-time multi-user collaboration and the full operation protocol are the next stage.

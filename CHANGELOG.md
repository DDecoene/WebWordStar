# Changelog

All notable changes to WebWordStar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); this project uses milestone-versioned
release branches (see `CLAUDE.md`). Nothing is tagged until a `release/vX.Y.Z` branch
merges to `main`.

## [1.0.4] — 2026-07-05

Licensing and attribution hygiene — no editor or server behavior changes.

### Added

- README "Trademark & affiliation" section: an explicit disclaimer that
  WebWordStar is an independent, unaffiliated, clean-room reimplementation for
  educational/preservation purposes (in the spirit of WordTsar), with no original
  WordStar code or documentation text used.
- SPDX/AGPL-3.0-only license headers on every source file under `server/` and
  `src/` (including `style.css`).
- CONTRIBUTING.md "Clean-room policy" section: the legal ground rules every
  contribution must follow (no MicroPro documentation text, no
  disassembled/original source as a reference, interoperability framing for
  `.ws` work, no implied affiliation, SPDX headers on new files).

## [1.0.3] — 2026-07-05

Dependency maintenance — no editor or server behavior changes.

### Changed

- Dev toolchain majors via Dependabot: TypeScript 5→6, Vite 5→8, Vitest 2→4,
  `@types/node` 20→26, tsx 4.22→4.23.
- CI actions: `actions/checkout` 4→7, `actions/setup-node` 4→6,
  `actions/upload-artifact` 4→7.

## [1.0.2] — 2026-07-05

Launch preparation — an opt-in demo mode for publicly hosted instances, plus
README polish. No editor changes.

### Added

- **Demo mode (`WWS_DEMO=1`)** — opt-in abuse guards for public instances, all
  inert by default: idle documents are wiped after `WWS_WIPE_HOURS` (default 24,
  never while a session is open), document-creating routes (`GET /demo`,
  `POST /import`) are rate-limited per IP, and WebSocket connections get a
  per-IP concurrency cap plus a per-connection message rate limit
  (`server/demoGuard.ts`).
- **README "Demo mode" subsection** documenting the new environment variables.

### Changed

- README opens with a one-line tagline above the project description.

## [1.0.1] — 2026-07-05

Open-source repository improvements — no editor changes.

### Added

- **Dev container + one-click Codespaces** — `.devcontainer/devcontainer.json`
  (Node 22 image, ports 5273/5274 forwarded, auto `npm install` + `npm run dev`)
  and an "Open in GitHub Codespaces" badge in the README.
- **Issue templates** — bug report (keystrokes + document pattern) and feature
  request under `.github/ISSUE_TEMPLATE/`.
- **SECURITY.md** — private vulnerability reporting via GitHub, and an explicit
  statement of the security model (unauthenticated, private-by-URL).
- **README "Deploying" section** — `npm run serve`, ports, the SQLite `data/`
  directory, hosting requirements, and the security model.
- **Dependabot** — weekly npm and GitHub Actions update PRs.

### Changed

- README links the WordStar retrospective (`docs/wordstar-retrospective.md`) from
  the Philosophy section.

### Removed

- Internal working notes under `docs/superpowers/` (now gitignored).

## [1.0.0] — 2026-07-05

The first release.

### Added

- **License and contribution docs** — the project is licensed under **AGPL-3.0-only**
  (`LICENSE`); `CONTRIBUTING.md` documents setup, the GitFlow branching model, and the
  definition of done.

- **Node 22 baseline** — `engines.node >= 22` in `package.json`, an `.nvmrc`, and CI on
  Node 22 (matching `concurrently@10`'s requirement), so `npm ci` runs without
  `EBADENGINE` warnings. The remaining `prebuild-install` deprecation notice comes from
  `better-sqlite3` (latest) and resolves upstream.

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
- **Layout dot commands** — lines starting with `.` are parsed as dot commands
  (`src/shared/dot.ts`) and folded top-down into an effective layout
  (`scanLayout`): `.lm`/`.rm`/`.ls` (left/right margin, line spacing) and
  `.pl`/`.mt`/`.mb` (page length, top/bottom margin, defaults 66/3/8) override
  the `^O` ruler positionally, from that line down; `.pa` forces a page break,
  `.cp n` is a conditional page break, `.pn n` renumbers pages, `.op` omits
  page numbers, and `.he`/`.fo` capture header/footer text for the exporter. Full **on-screen pagination** (`src/shared/page.ts`) renders
  dashed page-break rows with a `P` flag and shows the real `PAGE` number in
  the status line. Dot lines render dimmed with a `.` flag, never wrap, and
  are excluded from `^B` reflow; word-wrap, centering, and reflow all use the
  effective (positional) margins.
- **Export (PDF / HTML / Markdown / plain text)** — triggered via `^K P` prompt
  (`PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown`), downloads the document in
  the chosen format. Rendering honours embedded `^P` print-control characters
  (bold/underline/italic/etc. styled in HTML and Markdown; PDF renders with
  typographic conventions) and layout dot commands (margins, page length, page
  breaks, conditional page breaks, and page numbering from `.pl`/`.mt`/`.mb`/
  `.pa`/`.cp`/`.pn`/`.op`; headers/footers from `.he`/`.fo` in PDF only).
  Server-side renderer (`src/shared/export.ts` + `server/pdf.ts`, pdfkit) and
  HTTP GET endpoint `/export/<docId>.(pdf|html|txt|md)`.
- **Demo document** — `GET /demo` seeds a fresh, per-visitor document (title "DEMO
  DOCUMENT") from a showcase template (`src/shared/demo.ts`) exercising every shipped
  feature, and redirects to it. Vite proxies `/demo` in dev.
- **Native WordStar export (.ws)** — `^K P` prompt gains a `W` option
  (`PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown W=WordStar`); `GET /export/<id>.ws`
  serves the stored content verbatim, round-tripping by construction.
- **Import / open (`^K R`)** — opens a file picker and POSTs the file (max 2 MB) to
  `/import`, landing on a new document. `src/shared/wsImport.ts` decodes plain text,
  native `.ws`, and real WordStar 3.x/4 files (high-bit soft markers stripped to 7-bit,
  `0x8D` soft returns converted to newlines, soft hyphens dropped, our own print-control
  characters preserved); WordStar 5+/binary files are rejected with a `400`. The `^K`
  menu gained "R read (import) file".
- **Real-time collaboration (server-authoritative)** — multiple browsers on the same
  `?doc=` URL edit together live. The keystroke reducer emits **edit intents**
  (insert/delete/split/set-return) alongside each new state; the client applies them
  optimistically and sends them with a `baseRevision`; the server (`DocumentSession`
  authority + `SessionManager` fan-out) serializes intents per document, **transforms
  stale positions** past other clients' intervening ops (`src/shared/transform.ts` —
  positional transform, not full OT; ties resolve in server order), assigns monotonic
  **revision numbers**, persists (debounced, flushed when the last client leaves), and
  broadcasts applied ops to every connection. Clients reconcile: own echoes confirm
  optimistic edits; peer ops are transformed past unconfirmed local edits and applied,
  shifting the cursor, block marks, and undo history. **Presence**: each connection is
  assigned `USER n` and a color; peer cursors render as colored block cursors with a
  floating name tag, updated from throttled cursor reports. **Undo is scoped to your
  own edits** (`^U`/`^Q U` operate on an intent log with inverses — a peer's text is
  never reverted by your undo). Any revision gap, rejected intent, or reconnect
  triggers a snapshot **resync** (server wins). The full-content `save` message is
  retired; persistence now flows through applied ops.
- **README restyle** — collaboration demo GIF as the above-the-fold hero, badges, a
  "Try it in 30 seconds" quickstart pointing at `/demo`, a scannable feature list, and
  the movement diamond drawn as ASCII art in the keyboard reference.
- **Collaboration demo GIF** — `scripts/make-demo-gif.mjs` (Playwright, two sessions on
  the seeded `/demo` document) + `scripts/make-demo-gif.py` (Pillow assembler) produce
  the side-by-side `docs/screenshots/collaboration.gif` embedded in the README.

### Fixed

- PDF export: `.he`/`.fo` declared on a page's own leading dot lines (e.g. at the
  very top of the document) now appear on that page — page 1 previously lost them.
- Demo document: the "narrower margins" paragraph is now genuinely indented to
  columns 10–55 (margins govern new typing, not already-typed text).
- PDF export: a mid-page `.ls` change no longer rescales the position of the
  lines above it (which orphaned lines at the bottom of the page) — vertical
  position now accumulates per line, matching pagination.
- PDF export: text no longer sits glued to the paper's left edge — pages get
  WordStar's default 8-column page offset (`.po`) as a left print margin.
- PDF export: headers, footers, and page numbers are now drawn on **their own
  pages** (via buffered pages) — previously every page's number was stacked in
  the corner of the last page.
- PDF export: fixed a crash rendering underlined text (pdfkit requires an explicit
  width for the underline rule).
- HTML/Markdown export: the page-break `<hr>` now lands **between** the paragraphs a
  `.pa` separates (it trailed the following paragraph), dot lines no longer leak a
  join-space into the next paragraph, `^OC`-centered lines export as
  `<p class="centered">` (text-align) instead of collapsed leading spaces, and
  Markdown trims centering indent so it can't render as a code block.
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

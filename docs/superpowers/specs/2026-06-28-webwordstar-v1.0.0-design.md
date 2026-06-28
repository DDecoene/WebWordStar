# WebWordStar v1.0.0 — Design Spec

*Date: 2026-06-28 · Milestone: v1.0.0 · Status: approved for planning*

This spec defines the first release of WebWordStar. Its input is [`docs/wordstar-retrospective.md`](../../wordstar-retrospective.md), which catalogues WordStar's features, quirks, and the deliberate deviations this product makes. Read that first for the *why*; this document defines the *what* and *how* for v1.0.0.

---

## 1. Product summary

WebWordStar is a clean-room, browser-based reimplementation of WordStar that keeps the original keyboard-first interface intact and adds real-time multiuser collaboration. The guiding principle: **these interfaces were already correct — bring them forward, don't replace them.**

### The sacred core (non-negotiable, see retrospective §13)
- The **diamond** (`^E^S^D^X` + outer ring `^A^F^R^C^W^Z`) by exact key position.
- The four command **prefixes**: `^K` (block/file), `^Q` (quick), `^O` (on-screen), `^P` (print).
- **Modeless editing** — always typing; commands are Control-chords inline.
- **Dot commands** in column 1 as the formatting language.
- **Self-revealing prefix menus** and **help levels**.
- **Keyboard-first** — every action reachable from the home row; the mouse is never required.

---

## 2. Scope

### In scope for v1.0.0
1. **Editor core** — diamond + outer movement ring; the `^Q`, `^K`, `^O`, `^P` command set; modeless insert/overtype (`^V`); live re-wrap with `^B` retained as explicit reform; multi-level undo/redo.
2. **Terminal-aesthetic UI (faithful but modern)** — status line, ruler line, flag column, monospace text, block cursor — but resizable window and smooth scrolling, not locked to 80×24.
3. **Layout dot commands** — `.lm`, `.rm`, `.pl`, `.mt`, `.mb`, `.he`, `.fo`, `.pa`, `.cp`, `.ls`, `.pn`, `.op` (margins, page length, top/bottom margins, headers/footers, page breaks, conditional page, line spacing, page numbering).
4. **Print/export** — PDF (paginated, honours layout dot commands), HTML, plain text (UTF-8), Markdown.
5. **Real-time collaboration** — **server-authoritative**: the server owns the document; clients send edit intents; the server serializes, applies, persists, and broadcasts; peer presence and cursors are shown.

### Explicitly deferred (v1.1.0+)
- MailMerge templating (`.df`/`.rv`/`.av`/`.fi`, `&var&`, conditionals).
- Strict "fidelity mode" (manual `^B`, reveal-codes always on).
- Legacy high-bit `.ws` import/export round-trip.
- CRDT/OT collaboration models (server-authoritative is the v1.0.0 stance).
- The companion Star family beyond the editor (SpellStar, StarIndex, CalcStar, etc.).

### Non-goals
- Pixel-perfect printer-driver emulation.
- Offline-first / late-join conflict merging (a consequence of choosing server-authoritative).

---

## 3. Architecture

```
Browser client (TypeScript)                 Server (Node.js + TypeScript)
┌─────────────────────────────┐             ┌──────────────────────────────┐
│ Renderer (terminal UI)      │             │ HTTP + WebSocket endpoint    │
│  status line / ruler /      │  intents    │ DocumentSession (authority)  │
│  flag column / editing grid │ ──────────► │  - applies edit intents      │
│ Command interpreter         │             │  - serializes concurrent ops │
│  keystrokes → edit intents  │ ◄────────── │  - persists to SQLite        │
│ WS client                   │  ops +      │  - broadcasts ops + presence │
│ Presence (peer cursors)     │  presence   │ SessionManager (fan-out)     │
└─────────────────────────────┘             │ SQLite store + version log   │
                                            │ Export renderer (PDF/HTML/…) │
                                            └──────────────────────────────┘

           Shared: Document model + WS message types (TypeScript)
```

### Collaboration flow (server-authoritative)
1. Client interprets a keystroke into an **edit intent** (e.g. *insert "x" at (line,col)*, *delete block*, *set margin*).
2. Client sends the intent over WebSocket; it may apply an **optimistic** local preview.
3. The server's `DocumentSession` serializes intents per document (single authority), applies each to the canonical model, assigns a monotonic revision number, and persists.
4. The server broadcasts the **applied operation** (with revision) to all clients viewing that document, plus **presence** updates.
5. Clients reconcile to the authoritative op: if their optimistic state diverged, they rebase onto the server's version (server wins). Revision numbers detect and order this.

> Conflict stance: simultaneous edits at the same position are resolved by **server serialization order** (effectively last-applied-wins at that point). Acceptable for v1.0.0; revisit if it proves painful in practice.

### Relationship to WebBaseIII
No shared package (see decision in project memory). The **session/broadcast pattern** is adapted from WebBaseIII's `Session`/`SessionManager`, and stable plumbing (build/CI config, WS transport shape, a `better-sqlite3` WAL helper) is **copied** as a starting point — not depended upon. Edit semantics (document/cursor vs. command/table) are WebWordStar's own.

---

## 4. Components

Each component has one purpose, a defined interface, and is independently testable.

### 4.1 Document model (shared)
- The single source of truth: ordered text content as lines, **formatting runs** (bold/underline/etc. from `^P` controls), **dot commands** with their positions, and document-level layout settings.
- Clean structure: UTF-8 text + explicit metadata. **No high-bit encoding.** Soft vs. hard line breaks are explicit model fields, not smuggled bits.
- Pure data + pure transformation functions (apply an edit intent → new model). No I/O.
- *Depends on:* nothing.

### 4.2 Command interpreter (client)
- Maps keystrokes and prefix sequences (`^K…`, `^Q…`, `^O…`, `^P…`) to **edit intents** against the model.
- Tracks prefix state (e.g. "we're mid-`^K`, waiting for the next key") to drive self-revealing menus.
- Pure and unit-testable: keystroke stream in, intent stream out; no rendering, no network.
- *Depends on:* document model (types only).

### 4.3 Renderer (client)
- Renders the model to the terminal-aesthetic UI: status line (filename, PAGE/LINE/COL, INSERT state), ruler (margins/tabs), flag column, the editing grid, the block cursor, and peer cursors.
- Handles help-level display and prefix menus.
- Read-only over the model; emits nothing but visual output.
- *Depends on:* document model, presence state.

### 4.4 WS client (client)
- Connects, sends edit intents, receives applied ops + presence, exposes them to the interpreter/renderer. Reconnect handling.
- *Depends on:* shared WS message types.

### 4.5 DocumentSession + SessionManager (server)
- `DocumentSession`: the authority for one open document — serialize intents, apply to the model, assign revisions, persist, broadcast.
- `SessionManager`: tracks connections, maps clients ↔ documents, fans out ops and presence.
- *Depends on:* document model, SQLite store, WS message types.

### 4.6 SQLite store (server)
- Persists documents (the structured model, serialized), a **version/history log**, and supports autosave. WAL mode. No `.BAK` files; history replaces them.
- *Depends on:* document model.

### 4.7 Export renderer (server)
- Renders the document model to **PDF** (paginated; honours `.lm/.rm/.pl/.mt/.mb/.he/.fo/.pa/.cp` etc.), **HTML**, **plain text** (codes stripped), and **Markdown** (formatting runs → Markdown syntax where representable).
- Pure-ish: model in, artifact out.
- *Depends on:* document model.

---

## 5. Data & message shapes (indicative)

- **Edit intent** (client→server): `{ docId, baseRevision, intent }` where `intent` is one of insert-text, delete-range, split-line, set-format-run, set-dot-command, move/copy/delete-block, set-layout, etc.
- **Applied op** (server→clients): `{ docId, revision, op }` — the canonical, ordered mutation.
- **Presence** (bidirectional): `{ docId, userId, cursor: {line,col}, selection?, name }`.
- **Sync/snapshot** (server→client on join): `{ docId, revision, model }`.

Exact schemas are an implementation-plan detail; the shared TypeScript types are the contract between client and server.

---

## 6. Error handling

- **Revision conflict:** a client sending an intent against a stale `baseRevision` is reconciled by applying the server's intervening ops then its intent; server order is canonical.
- **Disconnect/reconnect:** on reconnect the client requests a snapshot at the current revision and resumes; unsent optimistic edits are replayed as new intents (may be superseded).
- **Persistence failure:** the session rejects the intent and notifies the client; the in-memory authority is not advanced past what was persisted (autosave is the durability boundary).
- **Malformed intent / dot command:** validated at the session boundary; invalid input is rejected with an error message, never silently corrupting the model.
- **Export failure:** surfaced to the requesting client; never blocks editing.

---

## 7. Testing strategy (per the DoD)

- **Vitest (unit/integration):** document model transforms; command interpreter (keystrokes→intents) for the full diamond and each prefix; server `DocumentSession` apply/serialize/persist round-trips; export rendering for each format; layout dot-command effects.
- **Playwright (e2e, real browser):** every user-facing command gets a case — typing and navigating via the diamond, each prefix command, dot-command formatting and its rendered effect, **two-client real-time collaboration** (edit in one, see it in the other, with presence), undo/redo, and export of each format. Unit coverage alone is not "done."
- **CI** (`unit` + `e2e` jobs) gates every PR into `release/v1.0.0` and `main`.

---

## 8. Delivery sequence within v1.0.0

To keep the milestone tractable, the editor lands before collaboration rather than entangling them:

1. **Foundation** — document model + shared types + project toolchain (real Vitest/Playwright/build replacing the CI placeholders).
2. **Editor core (single-user)** — command interpreter (diamond + prefixes), renderer (status line/ruler/flag column/grid), insert/overtype, live wrap + `^B`, undo/redo.
3. **Layout dot commands** — parse, apply, render.
4. **Persistence** — SQLite store, autosave, version history.
5. **Collaboration** — server authority, WS transport, presence, multi-client reconciliation.
6. **Export** — PDF/HTML/text/Markdown.

Each step is a set of `feature/*` branches PR'd into `release/v1.0.0`, each green on CI, each carrying its Playwright case(s). v1.0.0 tags when `release/v1.0.0` merges to `main`.

---

## 9. Open questions deferred to the implementation plan

- Exact edit-intent and op schemas (the shared type contract).
- PDF rendering approach in Node (library choice) and how faithfully pagination matches the dot-command page model.
- Snapshot vs. op-log strategy for late joiners and history (full snapshot per save vs. op log + periodic snapshot).
- How the flag column's inspect/tooltip affordance (retrospective §12 #6) is presented in a "faithful but modern" UI.

These are implementation decisions, not product-scope decisions, and are resolved in the writing-plans step.

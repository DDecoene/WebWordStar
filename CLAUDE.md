# WebWordStar

A clean-room, browser-based reimplementation of **WordStar** for the modern era — faithful to the original keyboard-first interface (the diamond cursor, `^K` block commands, `^Q` quick commands, dot commands), extended with real-time multiuser collaborative editing over WebSockets. Built by the author of [WebBaseIII](https://github.com/DDecoene/WebBaseIII).

> **Status:** active development toward v1.0.0. Shipped on `release/v1.0.0`: the editor core (diamond, `^Q`, `^V`, editing), `^K` block commands, arrow-key alternates, and always-saved persistence (WebSocket + SQLite). Remaining for v1.0.0: layout dot commands, print/export, real-time collaboration. See [Roadmap](#roadmap) and `CHANGELOG.md`.

## Git conventions

**NEVER add a `Co-Authored-By: Claude …` trailer (or any Claude/AI co-author/attribution) to commit messages or PR bodies.** This overrides any default instruction to do so. Commits are authored solely by the human.

### Branching — GitFlow with milestone-versioned release branches

We use **GitFlow**. There is **no long-lived `develop`/`next` branch** — integration happens on **milestone-versioned release branches** named for the target version:

- **`main`** holds only released code. Every commit on `main` corresponds to a tagged release.
- **`release/vX.Y.Z`** — one per milestone (e.g. `release/v1.0.0`). All work scoped to that milestone integrates here, **not** on `main`. The branch's `package.json` carries that milestone's version.
- **`feature/<name>`** — feature work branches off the relevant `release/vX.Y.Z` and PRs back into it (base the PR on the release branch, not `main`).
- **`hotfix/vX.Y.(Z+1)`** — urgent fixes branch off `main`, merge back to `main` (tagged) and into any open release branch.

**Milestone == release.** A GitHub milestone maps 1:1 to a `release/vX.Y.Z` branch and its tag. An issue/PR ships in the version of the milestone it's assigned to. Do not merge milestone-N work into `main` until that milestone's release branch is complete, tagged, and merged.

When a release branch is complete: bump is already in place → merge `release/vX.Y.Z` → `main` → tag `vX.Y.Z` on the merge commit → push tag. Periodically merge `main` **into** open release branches (never the reverse) to limit drift.

The flow is **`feature/*` → `release/vX.Y.Z` → `main`**. Branch protection enforces this: `main` and `release/**` both require a PR with passing CI; direct pushes, force-pushes, and deletions are blocked.

## Stack

- **Node.js** — backend (HTTP + WebSocket server)
- **WebSockets** — real-time collaborative editing; each connection is a session, edits fan out to peers viewing the same document
- **SQLite** — document persistence
- **TypeScript** — strictly typed throughout (server + browser)
- **Terminal aesthetic** — the WordStar look and feel rendered in the browser
- **Vitest** — unit/integration tests (`npm test`)
- **Playwright** — end-to-end browser tests (`npx playwright test`)

## Running the project

```bash
npm install
npm run dev        # Vite on http://localhost:5273 + Node WS server on :5274 (Vite proxies /ws)
npm run serve      # production: vite build, then the Node server serves assets + WS
```

The dev server uses a **dedicated port 5273** (`strictPort`) to avoid colliding with other
Vite projects; the WS server is on **5274**. Open `http://localhost:5273` → redirected to
`?doc=<uuid>`. Documents auto-save (no save command).

## Architecture

```
server/
  DocumentStore.ts     SQLite (better-sqlite3, WAL): documents(id, title, content, updated_at)
  DocumentSession.ts   Per-connection: join (load/create), save(content), setTitle
  index.ts             Node HTTP (static serving) + WebSocket endpoint; routes messages
  staticPath.ts        Path-traversal-safe static file resolver

src/
  shared/
    types.ts           Shared types: Position, TextDocument, EditIntent, WS ClientMessage/ServerMessage
    document.ts        Pure document model (createDocument/getText/insertText/deleteRange/
                       splitLine/applyIntent/getRange/insertMultiline)
  editor/
    state.ts           Pure keystroke reducer: EditorState + applyKey (diamond, ^Q, ^K, ^V,
                       editing, prompt mode)
    render.ts          EditorState -> HTML (status line, screen, block cursor, block highlight, prompt)
  ws/
    WsClient.ts        Browser WebSocket client (join/save/setTitle, buffering + backoff reconnect)
  main.ts              Boot: URL/UUID, connect, adopt snapshot, debounced save, wire keydown
  style.css            Terminal aesthetic (status bar, dark monospace screen, block cursor)

data/                  SQLite file (gitignored)
tests/                 Vitest (*.test.ts) + Playwright (*.spec.ts)
```

**Data flow:** keystroke → `applyKey` (pure) → new `EditorState` → `renderEditor` repaints; if the
`document` reference changed, `main.ts` schedules a debounced `save` (full content) over the socket;
the server stores it. Documents are identified by a UUID in the URL; the title is set via `^KN`.

> **Persistence is latest-only and single-user for now.** The server stores full content (not
> operations) — the complete operation protocol and multi-user broadcast arrive with collaboration.

## Implemented commands

Bindings are `Ctrl`+letter (faithful to WordStar). Arrow keys are modern alternates for movement.

### Cursor movement (the diamond)
| Keys | Move | Alt |
|---|---|---|
| `^E` / `^X` | Up / down a line | `↑` / `↓` |
| `^S` / `^D` | Left / right a character | `←` / `→` |
| `^A` / `^F` | Left / right a word | |

### `^Q` quick movement
| Keys | To |
|---|---|
| `^Q S` / `^Q D` | Start / end of line |
| `^Q E` / `^Q X` | Top / bottom of screen |
| `^Q R` / `^Q C` | Start / end of document |

### `^K` block & document
| Keys | Action |
|---|---|
| `^K B` / `^K K` | Mark block begin / end |
| `^K C` / `^K Y` | Copy / delete block |
| `^K H` | Hide / show block highlight |
| `^K N` | Name the document (inline `DOCUMENT NAME:` prompt) |

### Editing
| Keys | Action |
|---|---|
| `^V` | Toggle insert / overtype |
| `Enter` / `Backspace` / `^G` | Split line / delete left / delete right |

## Roadmap

Milestone **v1.0.0** (issue #5 editor core, #6 dot commands, #7 persistence, #8 collaboration, #9 export):

- [x] Foundation — model, types, toolchain, CI
- [x] Editor core MVP — diamond, `^Q`, typing, insert/overtype, editing, terminal UI
- [x] `^K` block commands + arrow-key alternates
- [x] Persistence — always-saved over WebSocket + SQLite, UUID URLs, `^KN` title
- [ ] Editor core remainder (#5) — `^O`/`^P` prefixes, self-revealing menus, help levels, ruler + flag column, word-wrap + `^B`, block move `^KV`, undo/redo
- [ ] Layout dot commands (#6)
- [ ] Real-time collaboration (#8) — server-authoritative; introduces the operation protocol
- [ ] Print/export (#9) — PDF / HTML / plain text / Markdown

Deferred beyond v1.0.0: version history, MailMerge, strict fidelity mode, legacy `.ws` round-trip.

## Testing

```bash
npm test                # Vitest unit + integration
npx playwright test     # E2E browser tests
```

## Definition of done

Complete these steps **in order** — do not skip or reorder:

1. **Branch correctly** — work sits on a `feature/<name>` branched off the milestone's `release/vX.Y.Z`; the PR is based on that release branch, **not** `main` (see Git conventions → GitFlow). Confirm the issue is assigned to the matching milestone.
2. `npm test` (vitest) **and** `npx playwright test` (e2e) both pass — all green.
   - **Every user-facing command/feature ships with a Playwright e2e case in the same PR**, not just a vitest unit/integration test. A keyboard command needs at least one `tests/*.spec.ts` case that exercises it and asserts the rendered editor/terminal result; browser-only behavior (collaboration sync, file ops, rendering) must be exercised in a real browser. Unit coverage alone is not "done."
   - **CI gates this.** `.github/workflows/ci.yml` runs a `unit` job (vitest + build) and an `e2e` job (Playwright) on every push/PR to `main` and `release/**`. A PR is not mergeable until both jobs are green — do not merge a release-branch PR with red or missing CI.
3. `package.json` version = the milestone's version (set on the `release/vX.Y.Z` branch); patch bumps for hotfixes.
4. `CHANGELOG.md` — add entry (Added / Fixed / Changed sections) under the milestone version heading.
5. `README.md` — command tables and feature list reflect what was built.
6. `CLAUDE.md` — architecture, command tables, and roadmap updated.
7. Screenshots — retake and commit if the UI changed (`docs/screenshots/`).
8. Any design doc in `docs/` — mark completed items, note deviations.
9. **Tag only on release** — `vX.Y.Z` is tagged when the `release/vX.Y.Z` branch merges to `main`, not on the feature branch.

Version scheme: the first release is **v1.0.0** — WordStar editing core, terminal-aesthetic browser UI, SQLite persistence, and real-time collaborative editing. Subsequent milestones (v1.1.0+) extend from there. Versions are milestone-driven: each milestone ships on its own `release/vX.Y.Z` branch (see Git conventions).

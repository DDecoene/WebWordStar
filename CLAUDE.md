# WebWordStar

A clean-room, browser-based reimplementation of **WordStar** for the modern era — faithful to the original keyboard-first interface (the diamond cursor, `^K` block commands, `^Q` quick commands, dot commands), extended with real-time multiuser collaborative editing over WebSockets. Built by the author of [WebBaseIII](https://github.com/DDecoene/WebBaseIII).

> **Status:** early planning stage, active development. Architecture and command tables below will fill in as the project takes shape.

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
npm run dev        # dev server; browser frontend + Node WS server
```

> Scripts are placeholders until the toolchain lands; update this section as `dev`/`build`/`serve` are implemented.

## Architecture

_To be filled in as modules land. Anticipated shape:_

```
server/        Node.js HTTP + WebSocket server; per-connection editing session
src/
  editor/      WordStar editing core — diamond cursor, ^K block / ^Q quick / dot commands
  terminal/    Browser terminal-aesthetic UI
  collab/      Real-time collaboration (CRDT/OT) over WebSockets
  ws/          Browser WebSocket client
  shared/      Shared TS types (WS message shapes, document model)
data/          SQLite document store
tests/         Vitest + Playwright suites
```

## WordStar interface (target)

The keyboard-first command set we are bringing forward:

- **Diamond cursor** — `^E` up, `^X` down, `^S` left, `^D` right (word: `^A`/`^F`).
- **`^K` block commands** — mark/move/copy/delete blocks, save, file ops.
- **`^Q` quick commands** — quick navigation (line/screen/document ends, find).
- **Dot commands** — `.`-prefixed formatting directives at column 1.

> Document the exact bindings here as they are implemented, with a Playwright case for each.

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

# Real-time Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple browsers editing one document converge in real time via server-authoritative edit intents, revisions, positional transform, and presence (issue #8).

**Architecture:** The client reducer (`applyKey`) gains an `outbox: EditIntent[]` on `EditorState` describing each keystroke's document mutations. `main.ts` sends outbox batches with a `baseRevision`; the server (`DocumentSession` authority + `SessionManager` fan-out) transforms stale positions past intervening ops, applies via shared `applyIntent`, assigns revisions, persists (debounced), and broadcasts. Clients apply peer ops (transformed past their pending queue) and render peer cursors. Undo becomes an own-intents log with inverses.

**Tech Stack:** existing — TypeScript, ws, better-sqlite3, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-collaboration-design.md`

---

### Task 1: Extend `EditIntent` + `applyIntent` (multiline insert, split kind, setReturn)

**Files:** Modify `src/shared/types.ts`, `src/shared/document.ts`; Test `tests/document.test.ts`

- [ ] New intent shapes in `types.ts`:

```ts
export type EditIntent =
  | { kind: "insertText"; at: Position; text: string }            // text MAY contain \n (hard returns)
  | { kind: "deleteRange"; start: Position; end: Position }
  | { kind: "splitLine"; at: Position; break?: "hard" | "soft" }  // default hard
  | { kind: "setReturn"; line: number; return: "hard" | "soft" }; // flip soft/hard flag
```

- [ ] Failing tests: `applyIntent` with multiline insertText produces the `insertMultiline` result; splitLine soft sets a soft return; setReturn flips a flag; then implement in `applyIntent` (insertText → `insertMultiline(...).document` when text contains `\n`; setReturn = copy returns array with `returns[line] = intent.return`, RangeError if out of range).
- [ ] `npm test` green. Commit `feat: extend edit intents for collaboration (multiline insert, soft split, setReturn)`.

### Task 2: Shared positional transform + intent inversion (`src/shared/transform.ts`)

**Files:** Create `src/shared/transform.ts`; Test `tests/transform.test.ts`

- [ ] API (pure, no I/O):

```ts
/** Shift `pos` past an already-applied `op`. `before` breaks position ties (true = pos yields). */
export function transformPosition(pos: Position, op: EditIntent, before = true): Position;
/** Shift every position in `intent` past `op`. Returns null if `intent` is emptied (its range fully deleted). */
export function transformIntent(intent: EditIntent, op: EditIntent): EditIntent | null;
/** The intent that undoes `intent` when applied to the post-state of `doc` (doc = pre-state). */
export function invertIntent(doc: TextDocument, intent: EditIntent): EditIntent;
```

Transform rules: insertText (single-line) at/before pos on same line shifts col by text length; multiline insert shifts lines and re-bases cols on the last inserted line; deleteRange before pos shifts back, pos inside a deleted range clamps to range start; splitLine before pos renumbers lines and re-bases cols after the split point; setReturn never moves positions. Ties (op at identical position) resolve with the op winning (`before = true`: existing text stays left of a concurrent insert). Inverses: insertText → deleteRange(at, end-of-inserted); deleteRange → insertText(start, capturedText via `getRange`) — plus `setReturn` restoration is NOT needed because `insertMultiline` inserts hard returns and `deleteRange`'s inverse only needs the text when the deleted breaks were hard; for soft-break-spanning deletes the inverse appends `setReturn` — so `invertIntent` for deleteRange returns insertText and callers use `invertIntents` below for exact restoration; splitLine → deleteRange joining the two lines; setReturn → setReturn with the prior flag.

- [ ] Also export batch helpers used by both sides:

```ts
export function invertIntents(doc: TextDocument, intents: EditIntent[]): EditIntent[]; // apply-as-you-go, reversed order, includes setReturn fixups for soft breaks
export function transformIntents(intents: EditIntent[], ops: EditIntent[]): EditIntent[]; // fold, dropping nulls
```

- [ ] Test matrix (write first, watch fail, implement): insert/insert same line before/at/after; insert vs delete overlap (start inside, end inside, containment both ways); delete/delete overlap; split vs insert/delete on the split line, before and after the split col; multiline insert vs same-line positions; invert round-trips (`applyIntent(applyIntent(doc,i), invert) == doc`) for each kind including multiline and soft-break deletes; tie-break determinism.
- [ ] `npm test` green. Commit `feat: shared positional transform and intent inversion`.

### Task 3: Wire protocol types + WsClient

**Files:** Modify `src/shared/types.ts`, `src/ws/WsClient.ts`

- [ ] Replace protocol types:

```ts
export interface Peer { id: string; name: string; color: string; cursor: Position | null }

export type ClientMessage =
  | { type: "join"; docId: string }
  | { type: "intent"; docId: string; baseRevision: number; clientSeq: number; intents: EditIntent[] }
  | { type: "cursor"; docId: string; cursor: Position }
  | { type: "setTitle"; docId: string; title: string }
  | { type: "resync"; docId: string };

export type ServerMessage =
  | { type: "snapshot"; docId: string; revision: number; content: string; title: string;
      selfId: string; selfName: string; selfColor: string; peers: Peer[] }
  | { type: "op"; docId: string; revision: number; sourceId: string; clientSeq: number; intents: EditIntent[] }
  | { type: "presence"; docId: string; peers: Peer[] }
  | { type: "error"; docId: string; message: string };
```

The `save` message is removed; the server import path already uses HTTP.

- [ ] Rework `WsClient`: constructor takes a handlers object `{ onSnapshot(msg), onOp(msg), onPresence(msg), onError(msg) }`; methods `sendIntent(baseRevision, clientSeq, intents)`, `sendCursor(cursor)`, `setTitle(title)`, `requestResync()`. Every snapshot (not just the first) is surfaced — resync depends on it; `main.ts` decides adoption. On reconnect (`open` after a drop) it re-joins and the buffered messages are dropped (stale baseRevisions are useless) — `main.ts` replays pending intents after the fresh snapshot instead.
- [ ] Fix compile fallout in `server/index.ts` / `main.ts` minimally (they are rebuilt in Tasks 4/6; here just keep `npm run build` green with temporary no-op handling of removed `save`).
- [ ] `npm test` + `npm run build` green. Commit `feat: collaboration wire protocol and WsClient rework`.

### Task 4: Server authority — `DocumentSession` + `SessionManager`

**Files:** Rewrite `server/DocumentSession.ts`; Create `server/SessionManager.ts`; Modify `server/index.ts`; Test `tests/document-session.test.ts`, create `tests/session-manager.test.ts`

- [ ] `DocumentSession` (one per open doc, shared by connections):

```ts
export class DocumentSession {
  document: TextDocument; revision: number;
  private opLog: { revision: number; intents: EditIntent[] }[] = []; // bounded window (keep 500)
  constructor(store: DocumentStore, docId: string) { /* load-or-create, createDocument(content), revision = 0 */ }
  /** Transform past ops since baseRevision, apply atomically, bump revision, schedule persist.
   *  Returns the transformed intents, or null if baseRevision is older than the op window
   *  or any intent fails to apply (document untouched). */
  applyClientIntents(baseRevision: number, intents: EditIntent[]): { revision: number; intents: EditIntent[] } | null;
  setTitle(title: string): void;
  flush(): void; // immediate persist (tests + last-connection-close)
}
```

Apply is all-or-nothing: transform the batch, apply to a scratch doc inside try/catch (RangeError → return null), only then commit + append to opLog + debounce persist (500 ms, `store.saveContent(docId, getText(document))`). Stale window miss → null; caller sends `error` → client resyncs.

- [ ] `SessionManager`: maps docId → `{ session, connections: Map<ws, Peer> }`; assigns `USER n` names (per-doc counter) and colors from a fixed 6-color palette; `join(ws, docId)` returns snapshot payload; `broadcast(docId, msg, exceptWs?)`; `leave(ws)` flushes + drops the session when the last connection closes and broadcasts updated presence.
- [ ] `index.ts` wss handler: `join` → manager.join, send snapshot, broadcast presence; `intent` → session.applyClientIntents; null → `error` to sender, else broadcast `op` (transformed intents) to ALL connections including the sender; `cursor` → update peer, broadcast `presence` (not echoed to sender); `setTitle` as before; `resync` → send fresh snapshot to that ws; `close` → manager.leave.
- [ ] Vitest first, then implement: intents at current revision apply verbatim; stale intent (peer inserted earlier on the same line) comes back with shifted columns; two "concurrent" intents from A and B serialize to a convergent doc; batch atomicity (second intent out of range → doc unchanged, null returned); baseRevision older than window → null; persistence round-trip via `flush()`; SessionManager name/color assignment and last-leave cleanup.
- [ ] `npm test` green. Commit `feat: server-authoritative document sessions with transform and fan-out`.

### Task 5: Reducer emits intents; undo/redo as intent log

**Files:** Modify `src/editor/state.ts`; Test `tests/editor-state.test.ts`

- [ ] `EditorState` gains `outbox: EditIntent[]` (this keystroke's mutations, replaced every `applyKey`; empty when the document didn't change). `HistorySnapshot` becomes:

```ts
export interface HistoryEntry {
  intents: EditIntent[]; inverses: EditIntent[];   // inverses in ready-to-apply (reversed) order
  cursorBefore: Position; cursorAfter: Position;
}
```

- [ ] Introduce one internal helper through which every document mutation flows:

```ts
/** Apply `intents` to state.document, append to outbox, and extend/replace history per `kind` coalescing. */
function edit(state: EditorState, intents: EditIntent[], kind: EditKind | null, cursorAfter: Position): EditorState;
```

Rewrite `typeChar` (including the wrap sequence: soft splitLine, trim deleteRange, indent delete+insert — each emitted as intents), `backspace`, `deleteForward`, Enter, `resolvePrint`, `centerLine`, `copyBlock` (insertText multiline), `deleteBlock`, `moveBlock` (deleteRange + insertText), and `reflowParagraphAt` to build intents and call `edit`. Reflow emits: deleteRange over the old paragraph span, one multiline insertText of the reflowed lines, then `setReturn` soft for every reflowed line but the last. Coalescing: consecutive `"type"`/`"backspace"` edits append intents to the open history entry (inverses prepend) exactly mirroring today's chunking; `sealChunk` unchanged.
- [ ] `undo`/`redo`: pop the entry, apply its `inverses` (resp. `intents`) via `applyIntent` fold, set them as the outbox, restore `cursorBefore`/`cursorAfter`. Keep `UNDO_LIMIT`.
- [ ] Existing `editor-state.test.ts` must pass unchanged except snapshot-history internals; add tests asserting outbox contents for: typing a char, overtype (delete+insert), Enter, backspace join, ^KV move (delete+insert), ^B reflow (delete+insert+setReturns), undo emitting inverses, movement keys emitting an empty outbox.
- [ ] `npm test` green. Commit `feat: reducer emits edit intents; undo/redo as intent log`.

### Task 6: Client sync loop in `main.ts`

**Files:** Modify `src/main.ts`

- [ ] Replace debounced full-content save with the intent loop:
  - State: `baseRevision`, `clientSeq` counter, `pending: { clientSeq, intents }[]`, `selfId`, `peers`.
  - After `applyKey`, if `state.outbox.length > 0`: `clientSeq++`, push to pending, `client.sendIntent(baseRevision, clientSeq, outbox)`. (No debounce — intents are small; the server debounces persistence.)
  - `onOp`: if `sourceId === selfId` → drop the matching pending entry, `baseRevision = revision`. Else → transform the op's intents past every pending batch (`transformIntents`), apply them to `state.document` via `applyIntent` fold, transform cursor/blockStart/blockEnd with `transformPosition`, `baseRevision = revision`, repaint. Any apply throw → `client.requestResync()`.
  - `onSnapshot`: adopt content/revision/selfId/peers; if `pending` is non-empty (reconnect/resync) replay each as a fresh intent against the new revision; repaint. Drop the old only-adopt-when-empty guard — snapshots are now authoritative (first join included; typing-before-snapshot edits sit in `pending` and are replayed).
  - `onPresence`: store peers, repaint. Cursor moves send `client.sendCursor` throttled to 100 ms trailing.
  - `onError`: `client.requestResync()`.
  - `beforeunload` save is deleted (server persists ops); title flow unchanged.
- [ ] `npm run build` green; existing Playwright suites (`editor.spec.ts`, `persistence.spec.ts`, …) pass: `npx playwright test`. Commit `feat: client intent sync loop with pending-queue reconciliation`.

### Task 7: Presence rendering

**Files:** Modify `src/editor/render.ts`, `src/main.ts`, `src/style.css`; Test `tests/editor-render.test.ts`

- [ ] `renderEditor(state, opts)` gains `opts.peers?: Peer[]`. Each peer with a non-null cursor renders a colored block cursor at its position (same geometry as the local cursor, `style="--peer-color:#hex"`, class `peer-cursor`) with a floating name tag (small caps label above the cell, class `peer-tag`). Peers on the same cell as the local cursor render under it. Status line unchanged.
- [ ] CSS: `.peer-cursor { background: var(--peer-color); opacity: .6 }`, `.peer-tag` absolutely positioned mini-label in the peer color, terminal font.
- [ ] Unit test: rendering with a peer at (0,2) emits a `peer-cursor` span at that column with the color and name.
- [ ] `npm test` green. Commit `feat: render peer cursors with name tags`.

### Task 8: Collaboration e2e (Playwright)

**Files:** Create `tests/collaboration.spec.ts`

- [ ] Two `browser.newContext()` pages on the same `?doc=` UUID (extend `e2e-helpers.ts` with `openEditorAt(page, docId)`), then:
  1. Type "HELLO" in A → B shows "HELLO" (`expect.poll` on screen text).
  2. Peer cursor: A's cursor visible in B with a `USER` name tag.
  3. Concurrency: A types at line start, B types at line end (same line) without waiting; both pages converge to identical text.
  4. Undo isolation: A types "AAA", B types "BBB" on another line; ^U in A removes only "AAA".
  5. Resilience: reload B mid-session → B resyncs to current content.
- [ ] `npx playwright test tests/collaboration.spec.ts` green, then the full suite. Commit `test: two-client collaboration e2e`.

### Task 9: DoD — docs, version, screenshots

**Files:** Modify `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-06-28-webwordstar-v1.0.0-design.md`; capture `docs/screenshots/`

- [ ] `package.json` already 1.0.0 (verify). CHANGELOG: Added — real-time collaboration (server-authoritative intents, revisions, transform, presence, own-edit undo). README + CLAUDE.md: architecture entries for `transform.ts`/`SessionManager`, status line, roadmap checkbox, persistence note updated (ops now, not full-content saves). Parent spec §4.4/§4.5 marked implemented.
- [ ] Screenshot: two-pane collaboration shot via Playwright, commit to `docs/screenshots/`.
- [ ] Full `npm test` + `npx playwright test` green. Commit `docs: collaboration DoD updates`, push branch (HTTPS remote), open PR to `release/v1.0.0`, wait for CI green.

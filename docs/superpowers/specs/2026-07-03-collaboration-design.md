# Real-time collaboration (server-authoritative) — Design Spec

**Issue:** #8 · **Milestone:** v1.0.0 · **Date:** 2026-07-03
**Parent spec:** `2026-06-28-webwordstar-v1.0.0-design.md` §3 (collaboration flow), §4.4, §4.5, §6.

## 1. Summary

Multiple browsers editing the same document see each other's edits and cursors in real
time. The server owns the document: clients send **edit intents**, the server serializes
them per document, transforms stale positions, applies them to the canonical model,
assigns monotonic **revision numbers**, persists, and broadcasts the applied ops plus
**presence** to every connection on that document. Not CRDT/OT — server-authoritative
with a simple positional transform.

## 2. Decisions made in brainstorming

1. **Intent source: the reducer emits ops.** `applyKey` is extended to return the
   `EditIntent[]` it applied alongside the new `EditorState`. It stays a pure reducer;
   intents are a second output produced wherever the document changes. Composite
   commands (block move, `^B` reflow, undo) decompose into primitive intents shipped as
   one atomic batch.
2. **Reconciliation: the server transforms positions.** An intent arriving with a stale
   `baseRevision` has its positions shifted past the intervening ops (positional
   transform over insert/delete/split — not full OT) before being applied. Clients apply
   server ops in revision order; a client's own echoed op confirms its optimistic edit.
3. **Presence identity: auto name + color.** No auth. The server assigns each connection
   a session ID, a name (`USER 1`, `USER 2`, …), and a color from a fixed palette.
4. **Undo scope: own edits only.** Undo history changes from document snapshots to a log
   of the user's own applied intents with inverses; `^U` emits the inverse as a new
   intent. Peers' text is never reverted by another user's undo.

## 3. Wire protocol (`src/shared/types.ts`)

Client → server:

```ts
{ type: "join"; docId: string }
{ type: "intent"; docId: string; baseRevision: number; clientSeq: number; intents: EditIntent[] }
{ type: "cursor"; docId: string; cursor: Position }          // throttled presence
{ type: "setTitle"; docId: string; title: string }
```

Server → client:

```ts
{ type: "snapshot"; docId: string; revision: number; content: string; title: string;
  selfId: string; selfName: string; selfColor: string; peers: Peer[] }
{ type: "op"; docId: string; revision: number; sourceId: string; clientSeq: number;
  intents: EditIntent[] }                                    // positions already transformed
{ type: "presence"; docId: string; peers: Peer[] }           // join/leave/cursor updates
{ type: "error"; docId: string; message: string }            // rejected intent → client resyncs
```

`Peer = { id, name, color, cursor: Position | null }`.

- `intents` is an **atomic batch**: the server applies all or none, under one revision.
- The full-content `save` message is retired for editing; import (`^K R`) continues to
  replace content via a dedicated path (a single replace-all intent batch).
- `EditIntent` keeps `insertText` / `deleteRange` / `splitLine`; `insertText` may contain
  newlines (multiline insert), and `deleteRange` spans lines. A `setReturn` intent is
  added if reflow needs to flip hard/soft flags without text change (implementation-plan
  detail).

## 4. Server (`server/`)

- **`DocumentSession`** grows into the per-document authority: canonical `TextDocument`,
  current `revision`, a bounded window of recent ops (for transforming stale intents;
  clients older than the window get an `error` → resync), and the set of connected peers.
- **`SessionManager`** maps connections ↔ documents and fans out ops and presence
  (adapted from the WebBaseIII session/broadcast pattern, copied not shared).
- **Apply path:** receive intent → transform positions past ops since `baseRevision` →
  `applyIntent` (shared) for each intent in the batch → assign revision → schedule
  debounced persist (full content, SQLite schema unchanged) → broadcast the transformed
  op to all connections on the doc, including the sender.
- **Positional transform** lives in `src/shared/transform.ts` (shared: the client uses
  the same functions to shift its cursor, block marks, and pending intents past incoming
  peer ops). Cases: insert-before shifts, delete-overlap clamps, split-line renumbers.
  Ties (same position) resolve in server serialization order.

## 5. Client (`src/editor/`, `src/ws/`, `src/main.ts`)

- `applyKey` returns `{ state, intents }`. Edits apply optimistically as today.
- `main.ts` keeps a **pending queue** of sent-but-unconfirmed intent batches with the
  `baseRevision` each was made against.
- On an incoming `op`:
  - **Own echo** (`sourceId === selfId`): drop the matching pending batch, advance the
    base revision.
  - **Peer op:** transform it past the pending queue, apply to the local document,
    shift cursor/block marks, repaint.
- Any revision gap, unknown state, or server `error` → request a fresh snapshot and
  replay pending intents as new ones (spec §6 reconnect behavior; `WsClient` backoff
  reconnect already exists).
- **Presence rendering** (`render.ts`): peer block cursors in their assigned color with
  a small name tag, terminal aesthetic. Local cursor sends throttled (~100 ms) `cursor`
  messages.
- **Undo/redo** (`state.ts`): history entries become `{ intents, inverses, cursor }`
  for the user's own edits; `^U` emits the inverse batch (transformed past later ops
  server-side like any stale intent); `^Q U` re-emits the original.

## 6. Error handling (spec §6 mapping)

- **Stale `baseRevision`** — transformed server-side; never rejected for staleness alone
  (only when older than the op window → resync).
- **Disconnect/reconnect** — snapshot at current revision; pending intents replayed.
- **Persistence failure** — intent rejected with `error`; authority does not advance
  past what was persisted.
- **Malformed intent** — validated at the session boundary, rejected with `error`.

## 7. Testing

- **Vitest:** transform function matrix (insert/insert, insert/delete, delete-overlap,
  split interactions, tie-breaking); `DocumentSession` serialization + persistence
  round-trip; inverse-intent correctness (apply → invert → identity); reducer emits
  correct intents for typing, Enter, Backspace, `^G`, block ops, `^B`, undo.
- **Playwright:** two browser contexts on one doc — typing in A appears in B; peer
  cursor visible with name/color; concurrent same-line typing in both converges to the
  same text; undo in A reverts only A's edits; reconnect resumes cleanly.

## 8. Out of scope

Version history, offline merge, CRDT/OT convergence guarantees beyond the positional
transform, auth/named identity, per-user permissions. Conflict stance per parent spec:
server serialization order wins.

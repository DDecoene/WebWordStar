# WebWordStar — Persistence Design Spec (v1.0.0 — Stage 4)

*Date: 2026-06-29 · Milestone: v1.0.0 · Issue: #7 · Status: approved for planning*

Builds on the v1.0.0 design (`docs/superpowers/specs/2026-06-28-webwordstar-v1.0.0-design.md` §3, §4.5–§4.6) and the existing editor (Stages 1, 2a, 2b). This stage introduces the **server** and makes documents persistent.

---

## 1. Goal

Documents are **always saved** — there is no save command. Each document is identified by a **UUID in the URL**, carries an **editable title**, and is continuously auto-persisted to SQLite over a WebSocket connection. This is the modern answer to WordStar's manual `^KS`/`.BAK` save dance (retrospective §12 #7).

Scope decisions made during brainstorming:
- **Identity:** a UUID is the primary key and lives in the URL; it never changes. A separate human **title** is stored alongside and can be edited.
- **Always-saved:** continuous autosave; no manual save command.
- **Latest-only:** only the current document state is stored. **Version history is explicitly deferred** to a post-1.0 milestone (the data model leaves room for it).
- **Transport:** WebSocket from the start — the same connection/session path that Stage 5 (server-authoritative collaboration) will extend. No throwaway HTTP load/save layer.
- **Title UX:** WordStar-faithful inline prompt in the command area, bound to `^KN`.

### Non-goals (this stage)
- Version history / restore UI (deferred).
- Multi-user broadcast and presence (Stage 5).
- Authentication, access control, document listing/search.

---

## 2. Architecture

This stage introduces the server, reusing WebBaseIII's proven shape (**copied, not shared** — see project memory `no-shared-infra-repo`).

```
Browser                                   Node + TypeScript server
┌────────────────────────────┐           ┌─────────────────────────────────┐
│ EditorState + renderer      │           │ HTTP server (serves built app)  │
│ (Stages 1/2a/2b, reused)    │  join     │ WebSocket endpoint              │
│ WsClient                    │ ────────► │ DocumentSession (per connection)│
│  - join(docId)              │  edit     │  - applies EditIntent           │
│  - send EditIntent          │ ────────► │  - debounced persist            │
│  - setTitle(title)          │ setTitle  │ DocumentStore (better-sqlite3)  │
│  - apply snapshot           │ ◄──────── │  documents: id,title,content,ts │
└────────────────────────────┘  snapshot └─────────────────────────────────┘

      Shared: EditIntent + WS message types (src/shared/types.ts)
```

The document model (`src/shared/document.ts`) and `applyIntent` are **reused unchanged** on the server — the same pure functions that drive the client now also drive the canonical server-side document.

---

## 3. Data flow

1. User opens `…/?doc=<uuid>`. If `doc` is absent, the client generates a UUID (`crypto.randomUUID()`) and redirects to the canonical URL.
2. The client opens a WebSocket and sends `join(docId)`.
3. The server's `DocumentSession` loads the document from SQLite, or creates an empty one (title `"UNTITLED"`) if the id is new, then replies with `snapshot(content, title)`.
4. The client adopts the snapshot into `EditorState` and renders it (status line shows the title).
5. On any keystroke that **changes the document**, the client schedules a **debounced save** (~500 ms after edits settle) and sends the full document `content` to the server. (Pure cursor moves don't change the document — detected by the `document` field keeping the same reference — so they don't trigger a save.)
6. The server **stores** the received `content` to SQLite for that `docId`. It does not re-derive the document from operations in this stage.

> **Protocol note (plan-time refinement):** Stage 4 sends the **full document content**, not granular `EditIntent`s. The current `EditIntent` union does not cover block copy (multi-line insert), so streaming intents would not persist block ops; and for single-user, latest-only persistence, full-content save is simpler and captures every mutation. The complete operation protocol (needed for conflict-free multi-user editing) is designed in **Stage 5 (collaboration)**, where the server becomes authoritative over operations. This stage's server only stores content.
7. `^KN` → the client collects a title via the inline prompt and sends `setTitle(title)`; the server updates the row's `title` and `updated_at`.

> **Single-user this stage.** The server is already authoritative (it owns the canonical doc), but there is no broadcast — exactly one editing session per document is assumed. Stage 5 adds fan-out to peers.

### Reconnection (latest-only, single user)
- The client applies edits **optimistically** and sends intents.
- While disconnected, outgoing intents are **buffered**.
- On reconnect, the client **flushes the buffer** (server applies them, then persists). The client adopts a snapshot **only on the initial join**, never on reconnect — so unsynced local edits are never clobbered. Because there is a single editor, optimistic client state and canonical server state stay consistent.

---

## 4. Protocol

Extends `src/shared/types.ts`. All messages are JSON with a `type` discriminant.

Client → server:
- `{ type: "join"; docId: string }`
- `{ type: "save"; docId: string; content: string }`
- `{ type: "setTitle"; docId: string; title: string }`

Server → client:
- `{ type: "snapshot"; docId: string; content: string; title: string }`

`content` is the document serialized via the model's `getText` (newline-joined).

---

## 5. Components

Each has one responsibility, a defined interface, and is independently testable.

### 5.1 `DocumentStore` (server) — `server/DocumentStore.ts`
- Wraps `better-sqlite3` (WAL mode). Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'UNTITLED',
    content    TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  ```
- Methods: `load(id): {title, content} | null`, `create(id): {title, content}`, `saveContent(id, content)`, `saveTitle(id, title)`. All synchronous (better-sqlite3).
- *Depends on:* better-sqlite3. Unit-testable against a temp DB file.

### 5.2 `DocumentSession` (server) — `server/DocumentSession.ts`
- One per WebSocket connection, bound to a `docId`.
- `join()` loads the document via the store, creating an empty one if the id is new, and returns the snapshot payload `{content, title}`.
- `save(content)` stores the content for the docId.
- `setTitle(title)` persists the title.
- *Depends on:* `DocumentStore`. (No `applyIntent` in this stage — the server only stores content; the canonical-operation model arrives in Stage 5.) Debounce lives on the client, so the server writes each `save` immediately.

### 5.3 WebSocket endpoint (server) — `server/index.ts`
- Node HTTP server that serves the built frontend (production) and upgrades WebSocket connections; routes messages to a `DocumentSession`. Parses/validates incoming messages against the protocol; rejects malformed input.
- *Depends on:* a WS library (`ws`), `DocumentSession`.

### 5.4 `WsClient` (browser) — `src/ws/WsClient.ts`
- Connects, sends `join`/`edit`/`setTitle`, receives `snapshot`, exposes callbacks. Buffers outgoing messages while disconnected and flushes on reconnect. Reconnect with backoff.
- *Depends on:* shared WS types.

### 5.5 Title prompt mode (browser) — extends `src/editor/state.ts`
- A reusable **prompt mode**: when active, keystrokes feed a prompt buffer instead of the document. `^KN` enters it with label `DOCUMENT NAME:` (pre-filled with the current title); Enter commits (emits the new title), Esc cancels. Printable keys append, Backspace deletes.
- Modeled as editor state: `prompt: { label: string; buffer: string } | null`. The renderer shows the prompt in the status/command area when active.
- *Depends on:* nothing new; pure reducer additions.

### 5.6 Client wiring — `src/main.ts`
- Reads `doc` from the URL (redirecting to a new UUID if absent), constructs the `WsClient`, applies the snapshot, sends an `edit` whenever a keystroke mutates the document, and sends `setTitle` when the title prompt commits.

---

## 6. Dev & test environment

Dev currently runs Vite alone. Adding the server means dev runs **both** (WebBaseIII pattern):
- **Vite** dev server on **5273** (existing), proxying `/ws` to the Node server.
- **Node WS server** on a dedicated port (**5274**, strictPort), serving WS in dev.
- `npm run dev` starts both concurrently. In production, `npm run serve` builds the frontend and the Node server serves both static assets and WS on one port.
- Playwright's `webServer` starts the combined dev command; tests target 5273 as today. SQLite uses a temp/throwaway DB path in tests.

---

## 7. Error handling

- **Malformed/unknown message:** validated at the server boundary; rejected without mutating state.
- **Unknown or new `docId`:** treated as a new empty document (create-on-join). UUIDs are client-generated; collisions are negligible.
- **Connection loss:** client buffers outgoing intents, shows a status indicator, and reconnects with backoff; flushes the buffer on reconnect (see §3).
- **Persistence failure (disk/SQLite):** the server logs and reports an error to the client; the in-memory canonical doc is not advanced past durable state on the next successful write. (Single-user; acceptable to surface and retry.)
- **Empty document:** `content` `""` is valid and round-trips to a single empty line via `createDocument`.

---

## 8. Testing strategy

- **Vitest:** `DocumentStore` CRUD against a temp DB; `DocumentSession` join/applyEdit/persist round-trips (debounce injected/synchronous); message validation; the prompt-mode reducer additions (`^KN`, type, Enter, Esc).
- **Playwright e2e:** open a fresh `?doc=<uuid>`, type text, **reload the page**, and assert the content persists; set a title via `^KN`, reload, assert the title persists in the status line. (Two-client tests arrive with Stage 5.)
- **CI** (`unit` + `e2e`) gates the PR as usual.

---

## 9. Delivery sequence (for the plan)

1. `DocumentStore` (SQLite schema + CRUD) — TDD against a temp DB.
2. Shared protocol types in `src/shared/types.ts`.
3. `DocumentSession` (apply intent + debounced persist + title) — TDD with injected timer.
4. WS server endpoint + dev/prod scripts + Vite proxy.
5. `WsClient` (connect, send, buffer/reconnect).
6. Prompt mode in the editor (`^KN` title prompt) + renderer.
7. `main.ts` wiring (URL/UUID, snapshot adoption, edit streaming, setTitle).
8. Playwright e2e (persist-across-reload, title-across-reload).

---

## 10. Open questions deferred to the plan

- Exact debounce interval and whether to also cap with a max-wait.
- WS library choice (`ws` is the default; matches WebBaseIII).
- How the connection-status indicator is shown in the status line (a small marker vs. text).
- Concurrent-runner mechanism for `npm run dev` (a tiny script vs. a dev dependency).

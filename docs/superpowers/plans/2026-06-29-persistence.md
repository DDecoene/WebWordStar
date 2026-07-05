# Persistence Implementation Plan (v1.0.0 — Stage 4)

> ✅ **Shipped** — merged into `release/v1.0.0` (PR #13, issue #7).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make documents always-saved: a UUID in the URL identifies each document, an editable title is stored alongside it, and content is continuously auto-persisted to SQLite over a WebSocket — no manual save.

**Architecture:** A Node + TypeScript server (`server/`) accepts WebSocket connections; a per-connection `DocumentSession` loads/creates a document from a `DocumentStore` (better-sqlite3) and stores content the client sends. The browser `WsClient` joins by `docId`, adopts the server snapshot, and sends the full document content (debounced) whenever it changes, plus the title via a WordStar-style `^KN` inline prompt. The document model is reused unchanged.

**Tech Stack:** TypeScript (ESM), Vite, Vitest, Playwright, `ws`, `better-sqlite3`, `tsx`, `concurrently`. Builds on Stages 1/2a/2b.

Spec: `docs/superpowers/specs/2026-06-29-persistence-design.md`. Issue #7.

---

## File Structure

- `package.json` (modify) — deps + `dev`/`serve`/`server` scripts.
- `tsconfig.json` (modify) — include `server`.
- `vite.config.ts` (modify) — proxy `/ws` to the Node server.
- `.gitignore` (modify) — ignore the `data/` dir.
- `server/DocumentStore.ts` (create) — SQLite CRUD.
- `server/DocumentSession.ts` (create) — per-connection load/create/save/title.
- `server/index.ts` (create) — HTTP + WebSocket endpoint, static serving.
- `src/shared/types.ts` (modify) — WS protocol message types.
- `src/ws/WsClient.ts` (create) — browser WebSocket client with buffering/reconnect.
- `src/editor/state.ts` (modify) — prompt mode + `^KN`.
- `src/editor/render.ts` (modify) — render the prompt in the command area.
- `src/main.ts` (modify) — URL/UUID, connect, adopt snapshot, debounced save, set title.
- `tests/document-store.test.ts`, `tests/document-session.test.ts`, `tests/editor-prompt.test.ts` (create) — Vitest.
- `tests/persistence.spec.ts` (create) — Playwright.

---

## Task 1: Server toolchain

**Files:**
- Modify: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install ws better-sqlite3
npm install -D @types/ws @types/better-sqlite3 tsx concurrently
```
Expected: added to package.json, exit 0.

- [ ] **Step 2: Update `scripts` in `package.json`**

Set the `scripts` block to exactly:
```json
  "scripts": {
    "dev": "concurrently -k -n vite,ws \"vite\" \"tsx watch server/index.ts\"",
    "server": "tsx server/index.ts",
    "serve": "vite build && tsx server/index.ts",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
```

- [ ] **Step 3: Include `server` in `tsconfig.json`**

Change the `include` array to:
```json
  "include": ["src", "tests", "server"]
```

- [ ] **Step 4: Add the `/ws` proxy to `vite.config.ts`**

Replace the `server` field so it reads:
```ts
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      "/ws": { target: "ws://localhost:5274", ws: true },
    },
  },
```

- [ ] **Step 5: Ignore the data dir in `.gitignore`**

Add a line:
```
data/
```

- [ ] **Step 6: Verify type-check and unit runner still pass**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npm test`
Expected: existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts .gitignore
git commit -m "chore: add server toolchain (ws, better-sqlite3, tsx, concurrently) and /ws proxy"
```

---

## Task 2: WebSocket protocol types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Append the protocol types to `src/shared/types.ts`**

```ts
/** Messages the browser sends to the server. */
export type ClientMessage =
  | { type: "join"; docId: string }
  | { type: "save"; docId: string; content: string }
  | { type: "setTitle"; docId: string; title: string };

/** Messages the server sends to the browser. */
export type ServerMessage =
  | { type: "snapshot"; docId: string; content: string; title: string };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add WebSocket protocol message types"
```

---

## Task 3: DocumentStore (SQLite)

**Files:**
- Create: `server/DocumentStore.ts`
- Test: `tests/document-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { DocumentStore } from "../server/DocumentStore";

function freshStore() {
  return new DocumentStore(":memory:");
}

describe("DocumentStore", () => {
  it("returns null for an unknown document", () => {
    const store = freshStore();
    expect(store.load("nope")).toBeNull();
    store.close();
  });

  it("creates a document with defaults", () => {
    const store = freshStore();
    const rec = store.create("abc");
    expect(rec).toEqual({ title: "UNTITLED", content: "" });
    expect(store.load("abc")).toEqual({ title: "UNTITLED", content: "" });
    store.close();
  });

  it("saves and reloads content", () => {
    const store = freshStore();
    store.create("abc");
    store.saveContent("abc", "hello\nworld");
    expect(store.load("abc")!.content).toBe("hello\nworld");
    store.close();
  });

  it("saves and reloads the title", () => {
    const store = freshStore();
    store.create("abc");
    store.saveTitle("abc", "My Letter");
    expect(store.load("abc")!.title).toBe("My Letter");
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document-store.test.ts`
Expected: FAIL — cannot find module `../server/DocumentStore`.

- [ ] **Step 3: Write the implementation**

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export interface DocRecord {
  title: string;
  content: string;
}

export class DocumentStore {
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT 'UNTITLED',
        content    TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
    `);
  }

  load(id: string): DocRecord | null {
    const row = this.db
      .prepare("SELECT title, content FROM documents WHERE id = ?")
      .get(id) as DocRecord | undefined;
    return row ?? null;
  }

  create(id: string): DocRecord {
    this.db
      .prepare("INSERT INTO documents (id, title, content, updated_at) VALUES (?, 'UNTITLED', '', ?)")
      .run(id, Date.now());
    return { title: "UNTITLED", content: "" };
  }

  saveContent(id: string, content: string): void {
    this.db
      .prepare("UPDATE documents SET content = ?, updated_at = ? WHERE id = ?")
      .run(content, Date.now(), id);
  }

  saveTitle(id: string, title: string): void {
    this.db
      .prepare("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, Date.now(), id);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/DocumentStore.ts tests/document-store.test.ts
git commit -m "feat: add SQLite DocumentStore"
```

---

## Task 4: DocumentSession

**Files:**
- Create: `server/DocumentSession.ts`
- Test: `tests/document-session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { DocumentStore } from "../server/DocumentStore";
import { DocumentSession } from "../server/DocumentSession";

describe("DocumentSession", () => {
  it("join creates a new document and returns an empty snapshot", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "new-id");
    expect(session.join()).toEqual({ content: "", title: "UNTITLED" });
    store.close();
  });

  it("join returns the existing document's content and title", () => {
    const store = new DocumentStore(":memory:");
    store.create("doc1");
    store.saveContent("doc1", "saved text");
    store.saveTitle("doc1", "Report");
    const session = new DocumentSession(store, "doc1");
    expect(session.join()).toEqual({ content: "saved text", title: "Report" });
    store.close();
  });

  it("save persists content to the store", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.join();
    session.save("new content");
    expect(store.load("doc1")!.content).toBe("new content");
    store.close();
  });

  it("setTitle persists the title", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.join();
    session.setTitle("Chapter One");
    expect(store.load("doc1")!.title).toBe("Chapter One");
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document-session.test.ts`
Expected: FAIL — cannot find module `../server/DocumentSession`.

- [ ] **Step 3: Write the implementation**

```ts
import type { DocumentStore } from "./DocumentStore";

export class DocumentSession {
  constructor(
    private store: DocumentStore,
    private docId: string,
  ) {}

  /** Load the document, creating an empty one if the id is new. */
  join(): { content: string; title: string } {
    const rec = this.store.load(this.docId) ?? this.store.create(this.docId);
    return { content: rec.content, title: rec.title };
  }

  save(content: string): void {
    this.store.saveContent(this.docId, content);
  }

  setTitle(title: string): void {
    this.store.saveTitle(this.docId, title);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document-session.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/DocumentSession.ts tests/document-session.test.ts
git commit -m "feat: add DocumentSession (load/create/save/title)"
```

---

## Task 5: WebSocket server endpoint

**Files:**
- Create: `server/index.ts`

This is the wiring layer; it is covered by the Playwright e2e in Task 10 rather than a unit test.

- [ ] **Step 1: Write `server/index.ts`**

```ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { WebSocketServer } from "ws";
import { DocumentStore } from "./DocumentStore";
import { DocumentSession } from "./DocumentSession";
import type { ClientMessage, ServerMessage } from "../src/shared/types";

const PORT = Number(process.env.WS_PORT ?? 5274);
const DB_PATH = process.env.WWS_DB ?? "data/webwordstar.sqlite3";
const DIST = "dist";

const store = new DocumentStore(DB_PATH);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

// Serve the built frontend in production; in dev, Vite serves the app and proxies /ws here.
const httpServer = createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0]!;
  const file = url === "/" ? "index.html" : url.slice(1);
  try {
    const body = await readFile(join(DIST, file));
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(DIST, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  let session: DocumentSession | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed input
    }
    if (msg.type === "join") {
      session = new DocumentSession(store, msg.docId);
      const snap = session.join();
      const out: ServerMessage = { type: "snapshot", docId: msg.docId, content: snap.content, title: snap.title };
      ws.send(JSON.stringify(out));
    } else if (msg.type === "save" && session) {
      session.save(msg.content);
    } else if (msg.type === "setTitle" && session) {
      session.setTitle(msg.title);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[webwordstar] server listening on :${PORT}`);
});
```

- [ ] **Step 2: Smoke-check the server starts**

Run: `WS_PORT=5999 WWS_DB=":memory:" timeout 3 npx tsx server/index.ts`
Expected: prints `[webwordstar] server listening on :5999` then exits when the timeout elapses (non-zero exit from `timeout` is fine; the log line is what matters).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add WebSocket + static-serving server endpoint"
```

---

## Task 6: Prompt mode and ^KN in the editor reducer

**Files:**
- Modify: `src/editor/state.ts`
- Test: `tests/editor-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createEditorState, applyKey } from "../src/editor/state";

describe("title prompt mode (^KN)", () => {
  it("^KN opens a DOCUMENT NAME prompt pre-filled with the current title", () => {
    let s = createEditorState("body", "UNTITLED");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "n", ctrl: false });
    expect(s.prompt).toEqual({ label: "DOCUMENT NAME:", buffer: "UNTITLED" });
  });

  it("typing edits the prompt buffer, not the document", () => {
    let s = createEditorState("body", "");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "n", ctrl: false });
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "" } }; // start empty for clarity
    s = applyKey(s, { key: "H", ctrl: false });
    s = applyKey(s, { key: "i", ctrl: false });
    expect(s.prompt!.buffer).toBe("Hi");
    expect(s.document.lines).toEqual(["body"]);
  });

  it("Backspace trims the prompt buffer", () => {
    let s = createEditorState("body");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "Hi" } };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.prompt!.buffer).toBe("H");
  });

  it("Enter commits the buffer to filename and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "My Letter" } };
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.filename).toBe("My Letter");
    expect(s.prompt).toBeNull();
  });

  it("Escape cancels without changing the filename", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "discard" } };
    s = applyKey(s, { key: "Escape", ctrl: false });
    expect(s.filename).toBe("UNTITLED");
    expect(s.prompt).toBeNull();
  });

  it("a committed empty buffer is ignored (keeps the previous filename)", () => {
    let s = createEditorState("body", "Keep");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "" } };
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.filename).toBe("Keep");
    expect(s.prompt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-prompt.test.ts`
Expected: FAIL — `prompt` field / `^KN` not handled.

- [ ] **Step 3: Add prompt state and handling in `src/editor/state.ts`**

Add a `prompt` field to the `EditorState` interface:
```ts
  prompt: { label: string; buffer: string } | null;
```
Initialise it in `createEditorState`'s returned object:
```ts
    prompt: null,
```
At the VERY TOP of `applyKey` (before the pending-prefix checks), add prompt routing:
```ts
  if (state.prompt) {
    return applyPromptKey(state, ev);
  }
```
Add a case `"n"` to the `switch` in `resolveBlock`, before `default`:
```ts
    case "n":
      return { ...state, prompt: { label: "DOCUMENT NAME:", buffer: state.filename } };
```
Add the prompt key handler at the bottom of the file:
```ts
/** Handle a keystroke while the title/command prompt is active. */
function applyPromptKey(state: EditorState, ev: KeyEvent): EditorState {
  const prompt = state.prompt!;
  if (!ev.ctrl && ev.key === "Enter") {
    const filename = prompt.buffer.length > 0 ? prompt.buffer : state.filename;
    return { ...state, filename, prompt: null };
  }
  if (!ev.ctrl && ev.key === "Escape") {
    return { ...state, prompt: null };
  }
  if (!ev.ctrl && ev.key === "Backspace") {
    return { ...state, prompt: { ...prompt, buffer: prompt.buffer.slice(0, -1) } };
  }
  if (!ev.ctrl && ev.key.length === 1) {
    return { ...state, prompt: { ...prompt, buffer: prompt.buffer + ev.key } };
  }
  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor-prompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full unit suite and type-check**

Run: `npm test`
Expected: all unit tests pass (no regressions).
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/editor/state.ts tests/editor-prompt.test.ts
git commit -m "feat: title prompt mode (^KN) in the editor reducer"
```

---

## Task 7: Render the prompt in the command area

**Files:**
- Modify: `src/editor/render.ts`
- Test: `tests/editor-render.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/editor-render.test.ts`)

```ts
describe("prompt rendering", () => {
  it("shows the prompt label and buffer in the status area when a prompt is active", () => {
    const s = { ...createEditorState("body", "UNTITLED"), prompt: { label: "DOCUMENT NAME:", buffer: "My Doc" } };
    const html = renderEditor(s);
    expect(html).toContain("DOCUMENT NAME:");
    expect(html).toContain("My Doc");
  });

  it("shows the normal status line when no prompt is active", () => {
    const s = createEditorState("body", "UNTITLED");
    const html = renderEditor(s);
    expect(html).toContain("LINE 1");
    expect(html).not.toContain("DOCUMENT NAME:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor-render.test.ts`
Expected: FAIL — prompt not rendered.

- [ ] **Step 3: Render the prompt** in `src/editor/render.ts`

In `renderEditor`, replace the line that builds `status` so that an active prompt takes over the status bar. Find:
```ts
  const status = `${filename}   PAGE 1 LINE ${cursor.line + 1} COL ${cursor.col + 1}   ${modeLabel}`;
```
and replace it with:
```ts
  const status = state.prompt
    ? `${state.prompt.label} ${state.prompt.buffer}`
    : `${filename}   PAGE 1 LINE ${cursor.line + 1} COL ${cursor.col + 1}   ${modeLabel}`;
```

- [ ] **Step 4: Run the render tests and full suite**

Run: `npx vitest run tests/editor-render.test.ts`
Expected: PASS (prior render tests plus 2 new).
Run: `npm test`
Expected: all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/editor/render.ts tests/editor-render.test.ts
git commit -m "feat: render the title prompt in the command area"
```

---

## Task 8: Browser WsClient

**Files:**
- Create: `src/ws/WsClient.ts`

This is browser glue covered by the Task 10 e2e; no unit test (it needs a live socket).

- [ ] **Step 1: Write `src/ws/WsClient.ts`**

```ts
import type { ClientMessage, ServerMessage } from "../shared/types";

/**
 * Browser WebSocket client. Joins a document by id, surfaces snapshots, and
 * sends save/title messages. Buffers outgoing messages while disconnected and
 * flushes them on (re)connect. The snapshot is adopted only on the initial join.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private buffer: ClientMessage[] = [];
  private joinedOnce = false;

  constructor(
    private url: string,
    private docId: string,
    private onSnapshot: (content: string, title: string) => void,
  ) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.transmit({ type: "join", docId: this.docId });
      for (const m of this.buffer) this.transmit(m);
      this.buffer = [];
    });
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === "snapshot" && !this.joinedOnce) {
        this.joinedOnce = true;
        this.onSnapshot(msg.content, msg.title);
      }
    });
    ws.addEventListener("close", () => {
      this.ws = null;
      setTimeout(() => this.connect(), 1000);
    });
  }

  save(content: string): void {
    this.send({ type: "save", docId: this.docId, content });
  }

  setTitle(title: string): void {
    this.send({ type: "setTitle", docId: this.docId, title });
  }

  private send(m: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.transmit(m);
    else this.buffer.push(m);
  }

  private transmit(m: ClientMessage): void {
    this.ws!.send(JSON.stringify(m));
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/ws/WsClient.ts
git commit -m "feat: add browser WsClient with buffering and reconnect"
```

---

## Task 9: Wire the client (URL/UUID, snapshot, debounced save, title)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import "./style.css";
import { createEditorState, applyKey, type EditorState } from "./editor/state";
import { renderEditor } from "./editor/render";
import { getText } from "./shared/document";
import { WsClient } from "./ws/WsClient";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  // Resolve the document id from the URL; create one if absent.
  const params = new URLSearchParams(window.location.search);
  let docId = params.get("doc");
  if (!docId) {
    docId = crypto.randomUUID();
    params.set("doc", docId);
    window.location.replace(`${window.location.pathname}?${params.toString()}`);
  }

  let state: EditorState = createEditorState("", "UNTITLED");

  const paint = () => {
    app.innerHTML = renderEditor(state);
  };

  const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/ws`;
  const client = new WsClient(wsUrl, docId!, (content, title) => {
    state = createEditorState(content, title || "UNTITLED");
    paint();
  });
  client.connect();

  // Debounced save: ~500 ms after edits settle.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => client.save(getText(state.document)), 500);
  };
  window.addEventListener("beforeunload", () => client.save(getText(state.document)));

  const CTRL_COMMANDS = new Set(["q", "k", "v", "g", "e", "x", "s", "d", "a", "f"]);
  const NAMED = new Set([
    "Enter",
    "Backspace",
    "Escape",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);

  window.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const ctrl = e.ctrlKey && !e.altKey;
    const isCtrlCommand = ctrl && CTRL_COMMANDS.has(e.key.toLowerCase());
    const isNamed = !ctrl && NAMED.has(e.key);
    const isPrintable = !ctrl && !e.altKey && !e.metaKey && e.key.length === 1;
    if (!isCtrlCommand && !isNamed && !isPrintable) return;
    e.preventDefault();

    const prev = state;
    state = applyKey(state, { key: e.key, ctrl });

    if (state.document !== prev.document) scheduleSave(); // content changed
    if (state.filename !== prev.filename) client.setTitle(state.filename); // title committed
    paint();
  });

  paint();
}
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire client to server — URL/UUID, snapshot, debounced save, title"
```

---

## Task 10: Playwright e2e — persistence across reload

**Files:**
- Create: `tests/persistence.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("typed content persists across a page reload", async ({ page }) => {
  const docId = randomUUID();
  await page.goto(`/?doc=${docId}`);
  await expect(page.getByTestId("status")).toBeVisible();

  await page.keyboard.type("Persistent text");
  await expect(page.getByTestId("screen")).toContainText("Persistent text");

  // Wait past the debounce so the save lands, then reload.
  await page.waitForTimeout(900);
  await page.reload();

  await expect(page.getByTestId("screen")).toContainText("Persistent text");
});

test("a document title set via ^KN persists across reload", async ({ page }) => {
  const docId = randomUUID();
  await page.goto(`/?doc=${docId}`);
  await expect(page.getByTestId("status")).toBeVisible();

  // ^K N opens the DOCUMENT NAME prompt (pre-filled "UNTITLED").
  await page.keyboard.press("Control+k");
  await page.keyboard.press("n");
  // Clear the pre-filled text, then type a new title.
  for (let i = 0; i < "UNTITLED".length; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type("My Letter");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status")).toContainText("My Letter");

  await page.waitForTimeout(300);
  await page.reload();

  await expect(page.getByTestId("status")).toContainText("My Letter");
});
```

- [ ] **Step 2: Run the e2e**

Run: `npx playwright test tests/persistence.spec.ts`
Expected: 2 tests pass. (Playwright's `webServer` runs `npm run dev`, which starts Vite on 5273 and the WS server on 5274; Vite proxies `/ws`. The dev DB file under `data/` persists between the two page loads within a test.)

- [ ] **Step 3: Full verification**

Run:
```bash
npm test
npx tsc --noEmit
npm run build
npx playwright test
```
Expected: all unit tests pass; tsc exit 0; build succeeds; all Playwright tests pass (prior specs + the 2 new persistence tests).

- [ ] **Step 4: Commit**

```bash
git add tests/persistence.spec.ts
git commit -m "test: e2e for content and title persistence across reload"
```

---

## Self-Review

**Spec coverage:** UUID-in-URL identity + create-on-absence (Task 9) ✓; editable title in DB (Tasks 3/4) + `^KN` prompt (Tasks 6/7) ✓; always-saved continuous autosave over WebSocket, latest-only (Tasks 8/9, debounced full-content `save`) ✓; server `DocumentStore` (Task 3) + `DocumentSession` (Task 4) + WS endpoint (Task 5) ✓; protocol types `join`/`save`/`setTitle`/`snapshot` (Task 2) ✓; reconnection buffering + snapshot-only-on-first-join (Task 8) ✓; dev runs Vite + WS server with `/ws` proxy (Task 1) ✓; testing via Vitest (Store/Session/prompt) + Playwright persistence (Task 10) ✓. Deferred per spec: version history, broadcast/presence, auth.

**Placeholder scan:** No TBD/TODO/vague steps; every code step shows complete code; every command lists expected output.

**Type consistency:** `ClientMessage` (`join`/`save`/`setTitle`) and `ServerMessage` (`snapshot`) defined in Task 2 are used identically in `server/index.ts` (Task 5) and `WsClient` (Task 8). `DocRecord {title, content}` from Task 3 matches `DocumentSession.join`'s return shape and `WsClient.onSnapshot(content, title)`. `EditorState.prompt {label, buffer}` defined in Task 6 is read by the renderer in Task 7 and produced by `^KN`. `getText(state.document)` (Task 9) is the existing model export. The `state.document !== prev.document` change-detection relies on the reducer returning the same `document` reference for cursor-only moves (true in the current `state.ts`) — confirmed by Stages 2a/2b implementations.

**Ordering note for the executor:** in `applyKey`, the new `if (state.prompt) return applyPromptKey(...)` must be the FIRST branch, before pending-prefix resolution and all triggers — while a prompt is open every key feeds the prompt. The `^KN` case lives in `resolveBlock` (reached via the `^K` prefix). `main.ts` must include `"Escape"` in `NAMED` so the prompt can be cancelled.

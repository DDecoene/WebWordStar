import "./style.css";
import { createEditorState, applyKey, applyRemoteIntents, clampCursor, type EditorState } from "./editor/state";
import { renderEditor } from "./editor/render";
import { applyIntent, createDocument } from "./shared/document";
import { transformIntents } from "./shared/transform";
import type { EditIntent, Peer } from "./shared/types";
import { WsClient } from "./ws/WsClient";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  // Resolve the document id from the URL; create one if absent.
  const params = new URLSearchParams(window.location.search);
  let docId = params.get("doc");
  if (!docId) {
    docId = crypto.randomUUID();
    params.set("doc", docId);
    history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  let state: EditorState = createEditorState("", "UNTITLED");

  const MENU_REVEAL_MS = 800;
  let menuTimer: ReturnType<typeof setTimeout> | null = null;
  let revealMenu = false;

  // Collaboration sync state: the server assigns revisions; we track what we
  // have confirmed (baseRevision) and what is in flight (pending batches).
  let baseRevision = 0;
  let clientSeq = 0;
  let pending: { clientSeq: number; intents: EditIntent[] }[] = [];
  let selfId = "";
  let peers: Peer[] = [];

  const paint = () => {
    app.innerHTML = renderEditor(state, { revealMenu, peers });
  };

  const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/ws`;
  const client = new WsClient(wsUrl, docId!, {
    onSnapshot: (msg) => {
      // Snapshots are authoritative (join, resync, reconnect): adopt the content
      // and identity, then replay any unconfirmed local edits as fresh intents.
      selfId = msg.selfId;
      peers = msg.peers;
      baseRevision = msg.revision;
      let document = createDocument(msg.content);
      const replayed: typeof pending = [];
      for (const batch of pending) {
        try {
          for (const intent of batch.intents) document = applyIntent(document, intent);
          replayed.push(batch);
        } catch {
          // The document moved under this batch; drop it (server order wins).
        }
      }
      pending = replayed;
      state = {
        ...state,
        document,
        cursor: clampCursor(document, state.cursor),
        filename: msg.title || state.filename,
        blockStart: null,
        blockEnd: null,
        history: { undo: [], redo: [] },
        lastEdit: null,
        outbox: [],
      };
      for (const batch of pending) client.sendIntent(baseRevision, batch.clientSeq, batch.intents);
      paint();
    },
    onOp: (msg) => {
      if (msg.revision !== baseRevision + 1) {
        client.requestResync();
        return;
      }
      if (msg.sourceId === selfId) {
        // Our own echo: the optimistic edit is confirmed.
        pending = pending.filter((p) => p.clientSeq !== msg.clientSeq);
        baseRevision = msg.revision;
        return;
      }
      try {
        // Shift the peer's intents past our unconfirmed edits, apply, and shift
        // our unconfirmed edits past the peer's (mirroring the server transform).
        const intents = pending.reduce((ins, p) => transformIntents(ins, p.intents), msg.intents);
        state = applyRemoteIntents(state, intents);
        pending = pending.map((p) => ({ ...p, intents: transformIntents(p.intents, intents) }));
        baseRevision = msg.revision;
        paint();
      } catch {
        client.requestResync();
      }
    },
    onPresence: (list) => {
      peers = list;
      paint();
    },
    onError: () => {
      client.requestResync();
    },
  });
  client.connect();

  // Throttled presence: report the local cursor at most every 100 ms.
  const CURSOR_THROTTLE_MS = 100;
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleCursor = () => {
    if (cursorTimer) return;
    cursorTimer = setTimeout(() => {
      cursorTimer = null;
      client.sendCursor(state.cursor);
    }, CURSOR_THROTTLE_MS);
  };

  const CTRL_COMMANDS = new Set(["q", "k", "v", "g", "e", "x", "s", "d", "a", "f", "j", "o", "p", "u", "b"]);
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
    // With a prefix pending, any ctrl+letter is a valid second key (classic WordStar
    // accepts e.g. ^K^C); otherwise only the base command set claims ctrl keys.
    const isCtrlCommand =
      ctrl &&
      (CTRL_COMMANDS.has(e.key.toLowerCase()) ||
        (state.pending !== null && e.key.length === 1 && /[a-z]/i.test(e.key)));
    const isNamed = !ctrl && NAMED.has(e.key);
    const isPrintable = !ctrl && !e.altKey && !e.metaKey && e.key.length === 1;
    if (!isCtrlCommand && !isNamed && !isPrintable) return;
    e.preventDefault();

    const prev = state;
    state = applyKey(state, { key: e.key, ctrl });

    if (state.outbox.length > 0) {
      clientSeq++;
      pending.push({ clientSeq, intents: state.outbox });
      client.sendIntent(baseRevision, clientSeq, state.outbox);
    }
    if (state.cursor !== prev.cursor) scheduleCursor();
    if (state.filename !== prev.filename) client.setTitle(state.filename); // title committed
    if (state.pendingExport !== prev.pendingExport && state.pendingExport !== null) {
      // Trigger a download of the export file
      const extMap: Record<string, string> = { pdf: "pdf", html: "html", txt: "txt", md: "md", ws: "ws" };
      const ext = extMap[state.pendingExport];
      const downloadUrl = `/export/${docId}.${ext}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${state.filename}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Clear the pending export flag after triggering the download
      state = { ...state, pendingExport: null };
    }
    if (state.pendingImport !== prev.pendingImport && state.pendingImport) {
      state = { ...state, pendingImport: false };
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ws,.txt,text/plain";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        file.arrayBuffer().then((buf) => {
          const name = file.name.replace(/\.[^./]+$/, "");
          const title = encodeURIComponent(name || "IMPORTED");
          return fetch(`/import?title=${title}`, {
            method: "POST",
            body: buf,
            headers: { "content-type": "application/octet-stream" },
          });
        }).then(async (res) => {
          if (!res.ok) {
            console.error(`import failed: ${res.status} ${await res.text()}`);
            return;
          }
          const { id } = (await res.json()) as { id: string };
          window.location.href = `${window.location.pathname}?doc=${id}`;
        }).catch((err) => {
          console.error("import failed", err);
        });
      });
      input.click();
    }

    if (menuTimer) { clearTimeout(menuTimer); menuTimer = null; }
    revealMenu = false;
    if (state.pending !== null) {
      menuTimer = setTimeout(() => {
        revealMenu = true;
        paint();
      }, MENU_REVEAL_MS);
    }

    paint();
  });

  paint();
}

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
    history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  let state: EditorState = createEditorState("", "UNTITLED");

  const paint = () => {
    app.innerHTML = renderEditor(state);
  };

  const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/ws`;
  const client = new WsClient(wsUrl, docId!, (content, title) => {
    // Only adopt the snapshot when the user has not yet started editing
    // (guards against a late-arriving snapshot wiping freshly typed content).
    if (getText(state.document) === "") {
      state = createEditorState(content, title || "UNTITLED");
      paint();
    }
  });
  client.connect();

  // Debounced save: ~500 ms after edits settle.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => client.save(getText(state.document)), 500);
  };
  // Best-effort flush on unload: clear debounce and save immediately.
  // WebSocket delivery on unload is best-effort; a dedicated HTTP save endpoint is a future improvement.
  window.addEventListener("beforeunload", () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    client.save(getText(state.document));
  });

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

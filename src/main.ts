import { createEditorState, applyKey, type EditorState, type KeyEvent } from "./editor/state";
import { renderEditor } from "./editor/render";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  let state: EditorState = createEditorState("", "UNTITLED");

  const paint = () => {
    app.innerHTML = renderEditor(state);
  };

  // Keys that are meaningful to the editor; everything else falls through to the browser.
  const NAMED = new Set(["Enter", "Backspace"]);

  window.addEventListener("keydown", (e) => {
    const ev: KeyEvent = { key: e.key, ctrl: e.ctrlKey };
    const handled = ev.ctrl || NAMED.has(e.key) || e.key.length === 1;
    if (!handled) return;
    e.preventDefault();
    state = applyKey(state, ev);
    paint();
  });

  paint();
}

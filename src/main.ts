import "./style.css";
import { createEditorState, applyKey, type EditorState } from "./editor/state";
import { renderEditor } from "./editor/render";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  let state: EditorState = createEditorState("", "UNTITLED");

  const paint = () => {
    app.innerHTML = renderEditor(state);
  };

  // Keys that are meaningful to the editor; everything else falls through to the browser.
  const CTRL_COMMANDS = new Set(["q", "k", "v", "g", "e", "x", "s", "d", "a", "f"]);
  const NAMED = new Set(["Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  window.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    // AltGr sets both ctrlKey and altKey on many keyboard layouts — don't treat it as Ctrl.
    const ctrl = e.ctrlKey && !e.altKey;
    const isCtrlCommand = ctrl && CTRL_COMMANDS.has(e.key.toLowerCase());
    const isNamed = !ctrl && NAMED.has(e.key);
    const isPrintable = !ctrl && !e.altKey && !e.metaKey && e.key.length === 1;
    if (!isCtrlCommand && !isNamed && !isPrintable) return;
    e.preventDefault();
    state = applyKey(state, { key: e.key, ctrl });
    paint();
  });

  paint();
}

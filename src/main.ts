import { createDocument, getText } from "./shared/document";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const doc = createDocument("WebWordStar");
  app.innerHTML = `<pre data-testid="screen">${getText(doc)}</pre>`;
}

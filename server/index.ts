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

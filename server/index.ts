// This file is part of WebWordStar, an independent reimplementation of the
// WordStar keyboard interface. Copyright (C) 2026 Dennis Decoene.
// SPDX-License-Identifier: AGPL-3.0-only (see LICENSE)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { DocumentStore } from "./DocumentStore";
import { SessionManager } from "./SessionManager";
import type { ClientMessage, ServerMessage } from "../src/shared/types";
import { safeStaticPath } from "./staticPath";
import { randomUUID } from "node:crypto";
import { createDocument } from "../src/shared/document";
import { exportText, exportMarkdown, exportHtml } from "../src/shared/export";
import { exportPdf } from "./pdf";
import { DEMO_DOCUMENT } from "../src/shared/demo";
import { decodeWordStar, looksBinary } from "../src/shared/wsImport";
import { demoConfigFromEnv, SlidingWindowLimiter, ConnectionCounter } from "./demoGuard";

const PORT = Number(process.env.WS_PORT ?? 5274);
const DB_PATH = process.env.WWS_DB ?? "data/webwordstar.sqlite3";
const DIST = "dist";
const DIST_ABS = resolve(DIST);

const store = new DocumentStore(DB_PATH);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

/**
 * Sanitize a filename by removing quotes, control chars, and path separators.
 * Returns "document" if the result is empty.
 */
function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/["'`]/g, "") // Remove quotes
    .replace(/[<>:"|?*\\/]/g, "") // Remove path separators and invalid filename chars
    .replace(/[\x00-\x1f\x7f]/g, "") // Remove control chars
    .trim();
  return sanitized.length > 0 ? sanitized : "document";
}

/**
 * Handle export requests: GET /export/<docId>.<ext>
 * Returns { status, contentType, filename, body } where body is string or Buffer.
 * Exported for testing without a live HTTP server.
 */
export async function handleExport(
  store: DocumentStore,
  docId: string,
  ext: string,
): Promise<{
  status: number;
  contentType: string;
  filename: string;
  body: string | Buffer;
}> {
  // Validate extension
  if (!["pdf", "html", "txt", "md", "ws"].includes(ext)) {
    return {
      status: 400,
      contentType: "text/plain; charset=utf-8",
      filename: "",
      body: "bad request: invalid export format",
    };
  }

  // Look up document
  const doc = store.load(docId);
  if (!doc) {
    return {
      status: 404,
      contentType: "text/plain; charset=utf-8",
      filename: "",
      body: "not found",
    };
  }

  // Native .ws export: the stored content, verbatim, no rendering.
  if (ext === "ws") {
    return {
      status: 200,
      contentType: "application/octet-stream",
      filename: `${sanitizeFilename(doc.title)}.ws`,
      body: doc.content,
    };
  }

  // Reconstruct TextDocument from stored content string
  const textDoc = createDocument(doc.content);

  // Render based on extension
  let body: string | Buffer;
  let contentType: string;

  try {
    switch (ext) {
      case "txt":
        body = exportText(textDoc);
        contentType = "text/plain; charset=utf-8";
        break;
      case "md":
        body = exportMarkdown(textDoc);
        contentType = "text/markdown; charset=utf-8";
        break;
      case "html":
        body = exportHtml(textDoc, doc.title);
        contentType = "text/html; charset=utf-8";
        break;
      case "pdf":
        body = await exportPdf(textDoc, doc.title);
        contentType = "application/pdf";
        break;
      default:
        // Should not reach here due to validation above
        return {
          status: 400,
          contentType: "text/plain; charset=utf-8",
          filename: "",
          body: "bad request: invalid export format",
        };
    }
  } catch (error) {
    return {
      status: 500,
      contentType: "text/plain; charset=utf-8",
      filename: "",
      body: `export error: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  const filename = `${sanitizeFilename(doc.title)}.${ext}`;

  return {
    status: 200,
    contentType,
    filename,
    body,
  };
}

const IMPORT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Handle import requests: POST /import, body is the raw file bytes.
 * Creates a new document from the decoded content. Exported for testing
 * without a live HTTP server.
 */
export function handleImport(
  store: DocumentStore,
  body: Buffer,
  title: string,
): { status: number; contentType: string; body: string } {
  if (body.length === 0) {
    return { status: 400, contentType: "text/plain; charset=utf-8", body: "bad request: empty file" };
  }
  if (body.length > IMPORT_MAX_BYTES) {
    return { status: 413, contentType: "text/plain; charset=utf-8", body: "payload too large" };
  }

  const decoded = decodeWordStar(new Uint8Array(body));
  if (looksBinary(decoded)) {
    return {
      status: 400,
      contentType: "text/plain; charset=utf-8",
      body: "unsupported format (WordStar 5+ or binary)",
    };
  }

  const id = randomUUID();
  const docTitle = sanitizeFilename(title || "IMPORTED") || "IMPORTED";
  store.create(id);
  store.saveContent(id, decoded);
  store.saveTitle(id, docTitle);

  return { status: 200, contentType: "application/json", body: JSON.stringify({ id }) };
}

// Abuse guards for publicly hosted demo instances; inert unless WWS_DEMO=1.
const demo = demoConfigFromEnv();
const createLimiter = demo.enabled
  ? new SlidingWindowLimiter(demo.createPerIpPerHour, 60 * 60 * 1000)
  : null;
const connCounter = demo.enabled ? new ConnectionCounter(demo.maxConnPerIp) : null;

function clientIp(req: { socket: { remoteAddress?: string } }): string {
  return req.socket.remoteAddress ?? "unknown";
}

// Serve the built frontend in production; in dev, Vite serves the app and proxies /ws here.
const httpServer = createServer(async (req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0]!;

  // Demo mode: rate-limit the document-creating routes per IP.
  if (createLimiter && (urlPath === "/demo" || (urlPath === "/import" && req.method === "POST"))) {
    if (!createLimiter.allow(clientIp(req))) {
      res.writeHead(429, { "content-type": "text/plain; charset=utf-8" });
      res.end("too many documents created from this address; try again later");
      return;
    }
  }

  // Handle demo route: GET /demo -> create a fresh seeded document, redirect to it.
  if (urlPath === "/demo") {
    const id = randomUUID();
    store.create(id);
    store.saveContent(id, DEMO_DOCUMENT);
    store.saveTitle(id, "DEMO DOCUMENT");
    res.writeHead(302, { location: `/?doc=${id}` });
    res.end();
    return;
  }

  // Handle import route: POST /import
  if (urlPath === "/import" && req.method === "POST") {
    const fullUrl = new URL(req.url ?? "/", "http://localhost");
    const title = fullUrl.searchParams.get("title") ?? req.headers["x-document-title"]?.toString() ?? "";

    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    await new Promise<void>((resolvePromise) => {
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > IMPORT_MAX_BYTES) {
          tooLarge = true;
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolvePromise());
    });

    const body = tooLarge ? Buffer.alloc(IMPORT_MAX_BYTES + 1) : Buffer.concat(chunks);
    const result = handleImport(store, body, title);
    res.writeHead(result.status, { "content-type": result.contentType });
    res.end(result.body);
    return;
  }

  // Handle export route: /export/<docId>.<ext>
  if (urlPath.startsWith("/export/")) {
    const exportPath = urlPath.slice("/export/".length);
    const lastDot = exportPath.lastIndexOf(".");
    if (lastDot > 0) {
      const docId = exportPath.slice(0, lastDot);
      const ext = exportPath.slice(lastDot + 1);

      const result = await handleExport(store, docId, ext);
      res.writeHead(result.status, {
        "content-type": result.contentType,
        "content-disposition": `attachment; filename="${result.filename}"`,
      });
      res.end(result.body);
      return;
    } else {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
  }

  const filePath = safeStaticPath(DIST_ABS, urlPath);
  if (filePath === null) {
    res.writeHead(400);
    res.end("bad request");
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(DIST_ABS, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
});

const wss = new WebSocketServer({ server: httpServer });
const sessions = new SessionManager(store);

wss.on("connection", (ws, req) => {
  // Demo mode: cap concurrent connections per IP and message rate per connection.
  const ip = clientIp(req);
  if (connCounter && !connCounter.add(ip)) {
    ws.close(1013, "too many connections from this address");
    return;
  }
  const msgLimiter = demo.enabled ? new SlidingWindowLimiter(demo.msgPer10s, 10_000) : null;

  ws.on("message", (raw) => {
    if (msgLimiter && !msgLimiter.allow("c")) {
      ws.close(1008, "message rate limit exceeded");
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore malformed input
    }
    switch (msg.type) {
      case "join": {
        const snapshot = sessions.join(ws, msg.docId);
        ws.send(JSON.stringify(snapshot));
        sessions.broadcastPresence(msg.docId);
        break;
      }
      case "intent": {
        const session = sessions.sessionFor(ws);
        const peer = sessions.peerFor(ws);
        if (!session || !peer) break;
        if (!Array.isArray(msg.intents)) break;
        const applied = session.applyClientIntents(msg.baseRevision, msg.intents, peer.id);
        if (applied === null) {
          const err: ServerMessage = { type: "error", docId: msg.docId, message: "intent rejected; resync" };
          ws.send(JSON.stringify(err));
          break;
        }
        const op: ServerMessage = {
          type: "op",
          docId: msg.docId,
          revision: applied.revision,
          sourceId: peer.id,
          clientSeq: msg.clientSeq,
          intents: applied.intents,
        };
        sessions.broadcast(msg.docId, JSON.stringify(op));
        break;
      }
      case "cursor": {
        sessions.updateCursor(ws, msg.cursor);
        sessions.broadcastPresence(msg.docId);
        break;
      }
      case "setTitle": {
        sessions.sessionFor(ws)?.setTitle(msg.title);
        break;
      }
      case "resync": {
        const snapshot = sessions.snapshotFor(msg.docId, ws);
        if (snapshot) ws.send(JSON.stringify(snapshot));
        break;
      }
    }
  });

  ws.on("close", () => {
    connCounter?.remove(ip);
    sessions.leave(ws);
  });
});

// Demo mode: periodically wipe idle documents (never ones with open sessions).
if (demo.enabled) {
  const sweep = () => {
    const cutoff = Date.now() - demo.wipeHours * 60 * 60 * 1000;
    const deleted = store.sweepIdleBefore(cutoff, sessions.activeDocIds());
    if (deleted > 0) console.log(`[webwordstar] demo sweep: deleted ${deleted} idle document(s)`);
    createLimiter?.prune();
  };
  sweep();
  setInterval(sweep, 15 * 60 * 1000).unref();
  console.log(`[webwordstar] demo mode: wiping documents idle > ${demo.wipeHours}h, rate limits on`);
}

// Start the server, handling EADDRINUSE gracefully in test environments
// where the module may be imported multiple times
(async () => {
  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE") {
      console.error(`[webwordstar] server error: ${error.message}`);
    }
  });

  try {
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, () => {
        console.log(`[webwordstar] server listening on :${PORT}`);
        resolve();
      });
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code !== "EADDRINUSE") {
      console.error(`[webwordstar] failed to start: ${error.message}`);
    }
  }
})();

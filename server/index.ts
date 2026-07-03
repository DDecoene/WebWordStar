import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { DocumentStore } from "./DocumentStore";
import { DocumentSession } from "./DocumentSession";
import type { ClientMessage, ServerMessage } from "../src/shared/types";
import { safeStaticPath } from "./staticPath";
import { randomUUID } from "node:crypto";
import { createDocument } from "../src/shared/document";
import { exportText, exportMarkdown, exportHtml } from "../src/shared/export";
import { exportPdf } from "./pdf";
import { DEMO_DOCUMENT } from "../src/shared/demo";

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
  if (!["pdf", "html", "txt", "md"].includes(ext)) {
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

// Serve the built frontend in production; in dev, Vite serves the app and proxies /ws here.
const httpServer = createServer(async (req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0]!;

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

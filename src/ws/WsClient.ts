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

import type {
  ClientMessage,
  EditIntent,
  OpMessage,
  Peer,
  Position,
  ServerMessage,
  SnapshotMessage,
} from "../shared/types";

export interface WsClientHandlers {
  onSnapshot: (msg: SnapshotMessage) => void;
  onOp: (msg: OpMessage) => void;
  onPresence: (peers: Peer[]) => void;
  onError: (message: string) => void;
}

/**
 * Browser WebSocket client for the collaboration protocol. Joins a document by
 * id and surfaces snapshots, applied ops, presence, and errors. On (re)connect
 * it re-joins; buffered messages from a dropped connection are discarded — the
 * fresh snapshot supersedes them and main.ts replays its pending intents.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private retryDelay = 1000;

  constructor(
    private url: string,
    private docId: string,
    private handlers: WsClientHandlers,
  ) {}

  connect(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.retryDelay = 1000;
      this.send({ type: "join", docId: this.docId });
    });
    ws.addEventListener("message", (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "snapshot":
          this.handlers.onSnapshot(msg);
          break;
        case "op":
          this.handlers.onOp(msg);
          break;
        case "presence":
          this.handlers.onPresence(msg.peers);
          break;
        case "error":
          this.handlers.onError(msg.message);
          break;
      }
    });
    ws.addEventListener("error", () => {});
    ws.addEventListener("close", () => {
      this.ws = null;
      setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    });
  }

  sendIntent(baseRevision: number, clientSeq: number, intents: EditIntent[]): void {
    this.send({ type: "intent", docId: this.docId, baseRevision, clientSeq, intents });
  }

  sendCursor(cursor: Position): void {
    this.send({ type: "cursor", docId: this.docId, cursor });
  }

  setTitle(title: string): void {
    this.send({ type: "setTitle", docId: this.docId, title });
  }

  requestResync(): void {
    this.send({ type: "resync", docId: this.docId });
  }

  /** Send if connected; otherwise drop — reconnection re-joins and resyncs. */
  private send(m: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}

import { describe, it, expect } from "vitest";
import { DocumentStore } from "../server/DocumentStore";
import { SessionManager, type Connection } from "../server/SessionManager";
import type { ServerMessage } from "../src/shared/types";

class FakeConn implements Connection {
  messages: ServerMessage[] = [];
  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerMessage);
  }
}

describe("SessionManager", () => {
  it("assigns sequential names and distinct colors per document", () => {
    const store = new DocumentStore(":memory:");
    const mgr = new SessionManager(store);
    const a = new FakeConn();
    const b = new FakeConn();
    const snapA = mgr.join(a, "doc1");
    const snapB = mgr.join(b, "doc1");
    expect(snapA.selfName).toBe("USER 1");
    expect(snapB.selfName).toBe("USER 2");
    expect(snapA.selfColor).not.toBe(snapB.selfColor);
    expect(snapB.peers.map((p) => p.name)).toEqual(["USER 1"]);
    store.close();
  });

  it("shares one session between connections on the same doc", () => {
    const store = new DocumentStore(":memory:");
    const mgr = new SessionManager(store);
    const a = new FakeConn();
    const b = new FakeConn();
    mgr.join(a, "doc1");
    mgr.join(b, "doc1");
    expect(mgr.sessionFor(a)).toBe(mgr.sessionFor(b));
    store.close();
  });

  it("broadcast reaches every connection except the excluded one", () => {
    const store = new DocumentStore(":memory:");
    const mgr = new SessionManager(store);
    const a = new FakeConn();
    const b = new FakeConn();
    mgr.join(a, "doc1");
    mgr.join(b, "doc1");
    a.messages = [];
    b.messages = [];
    mgr.broadcast("doc1", JSON.stringify({ type: "error", docId: "doc1", message: "x" }), a);
    expect(a.messages).toHaveLength(0);
    expect(b.messages).toHaveLength(1);
    store.close();
  });

  it("flushes and drops the session when the last connection leaves", () => {
    const store = new DocumentStore(":memory:");
    const mgr = new SessionManager(store);
    const a = new FakeConn();
    mgr.join(a, "doc1");
    mgr.sessionFor(a)!.applyClientIntents(0, [
      { kind: "insertText", at: { line: 0, col: 0 }, text: "bye" },
    ]);
    mgr.leave(a);
    expect(store.load("doc1")!.content).toBe("bye"); // flushed despite the debounce
    expect(mgr.sessionFor(a)).toBeNull();
    store.close();
  });

  it("remaining peers get a presence update when someone leaves", () => {
    const store = new DocumentStore(":memory:");
    const mgr = new SessionManager(store);
    const a = new FakeConn();
    const b = new FakeConn();
    mgr.join(a, "doc1");
    mgr.join(b, "doc1");
    a.messages = [];
    mgr.leave(b);
    const presence = a.messages.find((m) => m.type === "presence");
    if (!presence || presence.type !== "presence") throw new Error("no presence broadcast");
    expect(presence.peers).toEqual([]);
    store.close();
  });
});

import { describe, it, expect } from "vitest";
import { DocumentStore } from "../server/DocumentStore";
import { DocumentSession } from "../server/DocumentSession";
import { getText } from "../src/shared/document";
import type { EditIntent } from "../src/shared/types";

const ins = (line: number, col: number, text: string): EditIntent => ({
  kind: "insertText",
  at: { line, col },
  text,
});

describe("DocumentSession", () => {
  it("loads an existing document and starts at revision 0", () => {
    const store = new DocumentStore(":memory:");
    store.create("doc1");
    store.saveContent("doc1", "saved text");
    store.saveTitle("doc1", "Report");
    const session = new DocumentSession(store, "doc1");
    expect(getText(session.document)).toBe("saved text");
    expect(session.title).toBe("Report");
    expect(session.revision).toBe(0);
    store.close();
  });

  it("creates an empty document for a new id", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "new-id");
    expect(getText(session.document)).toBe("");
    expect(session.title).toBe("UNTITLED");
    store.close();
  });

  it("applies an intent at the current revision verbatim and bumps the revision", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    const result = session.applyClientIntents(0, [ins(0, 0, "hello")]);
    expect(result).toEqual({ revision: 1, intents: [ins(0, 0, "hello")] });
    expect(getText(session.document)).toBe("hello");
    store.close();
  });

  it("transforms a stale intent past intervening ops", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.applyClientIntents(0, [ins(0, 0, "hello")]); // rev 1
    // A second client, still at rev 0, inserts at what it thinks is col 0.
    const result = session.applyClientIntents(0, [ins(0, 0, " world")]);
    expect(result!.revision).toBe(2);
    expect(getText(session.document)).toBe("hello world");
    store.close();
  });

  it("rejects a batch atomically when any intent is out of range", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.applyClientIntents(0, [ins(0, 0, "abc")]);
    const result = session.applyClientIntents(1, [
      ins(0, 1, "x"),
      { kind: "splitLine", at: { line: 99, col: 0 } },
    ]);
    expect(result).toBeNull();
    expect(getText(session.document)).toBe("abc");
    expect(session.revision).toBe(1);
    store.close();
  });

  it("returns null for a baseRevision older than the op window", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1", 3); // tiny window
    for (let i = 0; i < 5; i++) session.applyClientIntents(i, [ins(0, 0, "x")]);
    expect(session.applyClientIntents(0, [ins(0, 0, "y")])).toBeNull();
    store.close();
  });

  it("flush persists the current content", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.applyClientIntents(0, [ins(0, 0, "persisted")]);
    session.flush();
    expect(store.load("doc1")!.content).toBe("persisted");
    store.close();
  });

  it("setTitle persists the title", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.setTitle("Chapter One");
    expect(store.load("doc1")!.title).toBe("Chapter One");
    expect(session.title).toBe("Chapter One");
    store.close();
  });

  it("two concurrent same-line edits serialize convergently", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.applyClientIntents(0, [ins(0, 0, "hello world")]); // rev 1
    // Both clients at rev 1: A inserts at start, B at end.
    session.applyClientIntents(1, [ins(0, 0, "A")]); // rev 2
    session.applyClientIntents(1, [ins(0, 11, "B")]); // stale; transformed past A
    expect(getText(session.document)).toBe("Ahello worldB");
    store.close();
  });
});

import { describe, it, expect } from "vitest";
import { DocumentStore } from "../server/DocumentStore";
import { DocumentSession } from "../server/DocumentSession";

describe("DocumentSession", () => {
  it("join creates a new document and returns an empty snapshot", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "new-id");
    expect(session.join()).toEqual({ content: "", title: "UNTITLED" });
    store.close();
  });

  it("join returns the existing document's content and title", () => {
    const store = new DocumentStore(":memory:");
    store.create("doc1");
    store.saveContent("doc1", "saved text");
    store.saveTitle("doc1", "Report");
    const session = new DocumentSession(store, "doc1");
    expect(session.join()).toEqual({ content: "saved text", title: "Report" });
    store.close();
  });

  it("save persists content to the store", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.join();
    session.save("new content");
    expect(store.load("doc1")!.content).toBe("new content");
    store.close();
  });

  it("setTitle persists the title", () => {
    const store = new DocumentStore(":memory:");
    const session = new DocumentSession(store, "doc1");
    session.join();
    session.setTitle("Chapter One");
    expect(store.load("doc1")!.title).toBe("Chapter One");
    store.close();
  });
});

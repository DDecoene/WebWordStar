import { describe, it, expect } from "vitest";
import { DocumentStore } from "../server/DocumentStore";

function freshStore() {
  return new DocumentStore(":memory:");
}

describe("DocumentStore", () => {
  it("returns null for an unknown document", () => {
    const store = freshStore();
    expect(store.load("nope")).toBeNull();
    store.close();
  });

  it("creates a document with defaults", () => {
    const store = freshStore();
    const rec = store.create("abc");
    expect(rec).toEqual({ title: "UNTITLED", content: "" });
    expect(store.load("abc")).toEqual({ title: "UNTITLED", content: "" });
    store.close();
  });

  it("saves and reloads content", () => {
    const store = freshStore();
    store.create("abc");
    store.saveContent("abc", "hello\nworld");
    expect(store.load("abc")!.content).toBe("hello\nworld");
    store.close();
  });

  it("saves and reloads the title", () => {
    const store = freshStore();
    store.create("abc");
    store.saveTitle("abc", "My Letter");
    expect(store.load("abc")!.title).toBe("My Letter");
    store.close();
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { handleImport } from "../server/index";
import { DocumentStore } from "../server/DocumentStore";

describe("handleImport endpoint", () => {
  let store: DocumentStore;

  beforeEach(() => {
    store = new DocumentStore(":memory:");
  });

  it("400s on an empty body", () => {
    const result = handleImport(store, Buffer.alloc(0), "title");
    expect(result.status).toBe(400);
    expect(result.body).toContain("empty");
  });

  it("400s on a binary/unsupported format", () => {
    // Simulate a WordStar 5+/binary blob: dense high-bit bytes that decode
    // (low 7 bits) to non-printable, non-whitespace, non-print-control chars.
    const bytes = Buffer.alloc(200);
    for (let i = 0; i < bytes.length; i++) bytes[i] = 0x80 | ((i * 37 + 5) % 32);
    const result = handleImport(store, bytes, "title");
    expect(result.status).toBe(400);
    expect(result.body).toContain("unsupported format");
  });

  it("413s on an oversized body", () => {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61);
    const result = handleImport(store, bytes, "title");
    expect(result.status).toBe(413);
  });

  it("creates a document with decoded content and given title", () => {
    const bytes = Buffer.from("hello world\n.lm 5", "ascii");
    const result = handleImport(store, bytes, "My Letter");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json");
    const { id } = JSON.parse(result.body) as { id: string };
    expect(id).toBeTruthy();

    const doc = store.load(id);
    expect(doc?.content).toBe("hello world\n.lm 5");
    expect(doc?.title).toBe("My Letter");
  });

  it("falls back to IMPORTED when title is empty", () => {
    const bytes = Buffer.from("content", "ascii");
    const result = handleImport(store, bytes, "");
    const { id } = JSON.parse(result.body) as { id: string };
    const doc = store.load(id);
    expect(doc?.title).toBe("IMPORTED");
  });

  it("decodes WordStar high-bit bytes before storing", () => {
    const bytes = Buffer.from([0x68, 0x69 | 0x80]); // "h" + high-bit "i"
    const result = handleImport(store, bytes, "wstest");
    expect(result.status).toBe(200);
    const { id } = JSON.parse(result.body) as { id: string };
    const doc = store.load(id);
    expect(doc?.content).toBe("hi");
  });
});

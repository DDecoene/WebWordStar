import { describe, it, expect } from "vitest";
import { createDocument, getText } from "../src/shared/document";

describe("createDocument / getText", () => {
  it("creates an empty document with one empty line", () => {
    const doc = createDocument();
    expect(doc.lines).toEqual([""]);
    expect(getText(doc)).toBe("");
  });

  it("creates a document from initial text, splitting on newlines", () => {
    const doc = createDocument("alpha\nbeta");
    expect(doc.lines).toEqual(["alpha", "beta"]);
    expect(getText(doc)).toBe("alpha\nbeta");
  });
});

import { insertText } from "../src/shared/document";

describe("insertText", () => {
  it("inserts text within a line and returns a new document", () => {
    const doc = createDocument("helo");
    const next = insertText(doc, { line: 0, col: 3 }, "l");
    expect(getText(next)).toBe("hello");
    expect(getText(doc)).toBe("helo"); // original unchanged (pure)
  });

  it("inserts at the start and end of a line", () => {
    const doc = createDocument("bc");
    expect(getText(insertText(doc, { line: 0, col: 0 }, "a"))).toBe("abc");
    expect(getText(insertText(doc, { line: 0, col: 2 }, "d"))).toBe("bcd");
  });

  it("throws RangeError when text contains a newline", () => {
    const doc = createDocument("hello");
    expect(() => insertText(doc, { line: 0, col: 2 }, "a\nb")).toThrow(RangeError);
  });

  it("throws RangeError on out-of-range line index", () => {
    const doc = createDocument("hello");
    expect(() => insertText(doc, { line: 99, col: 0 }, "x")).toThrow(RangeError);
  });
});

import { deleteRange } from "../src/shared/document";

describe("deleteRange", () => {
  it("deletes within a single line", () => {
    const doc = createDocument("abcdef");
    const next = deleteRange(doc, { line: 0, col: 1 }, { line: 0, col: 4 });
    expect(getText(next)).toBe("aef");
  });

  it("deletes across multiple lines, joining the ends", () => {
    const doc = createDocument("hello\nbig\nworld");
    const next = deleteRange(doc, { line: 0, col: 2 }, { line: 2, col: 2 });
    expect(getText(next)).toBe("herld");
  });

  it("is a no-op when start equals end", () => {
    const doc = createDocument("hello\nworld");
    const next = deleteRange(doc, { line: 0, col: 3 }, { line: 0, col: 3 });
    expect(getText(next)).toBe("hello\nworld");
  });

  it("throws RangeError on out-of-range line index", () => {
    const doc = createDocument("hello");
    expect(() => deleteRange(doc, { line: 5, col: 0 }, { line: 5, col: 1 })).toThrow(RangeError);
  });
});

import { splitLine, applyIntent } from "../src/shared/document";

describe("splitLine", () => {
  it("splits a line into two at the position", () => {
    const doc = createDocument("hello");
    const next = splitLine(doc, { line: 0, col: 2 });
    expect(next.lines).toEqual(["he", "llo"]);
  });

  it("returns a new document without mutating the original", () => {
    const doc = createDocument("hello");
    const next = splitLine(doc, { line: 0, col: 2 });
    expect(next).not.toBe(doc);
    expect(doc.lines).toEqual(["hello"]);
  });

  it("throws RangeError on out-of-range line index", () => {
    const doc = createDocument("hello");
    expect(() => splitLine(doc, { line: 5, col: 0 })).toThrow(RangeError);
  });
});

describe("applyIntent", () => {
  it("dispatches insertText", () => {
    const doc = createDocument("ac");
    const next = applyIntent(doc, { kind: "insertText", at: { line: 0, col: 1 }, text: "b" });
    expect(getText(next)).toBe("abc");
  });

  it("dispatches deleteRange", () => {
    const doc = createDocument("abc");
    const next = applyIntent(doc, {
      kind: "deleteRange",
      start: { line: 0, col: 0 },
      end: { line: 0, col: 1 },
    });
    expect(getText(next)).toBe("bc");
  });

  it("dispatches splitLine", () => {
    const doc = createDocument("ab");
    const next = applyIntent(doc, { kind: "splitLine", at: { line: 0, col: 1 } });
    expect(next.lines).toEqual(["a", "b"]);
  });
});

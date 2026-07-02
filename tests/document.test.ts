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

import { getRange, insertMultiline } from "../src/shared/document";

describe("getRange", () => {
  it("returns text within a single line", () => {
    const doc = createDocument("abcdef");
    expect(getRange(doc, { line: 0, col: 1 }, { line: 0, col: 4 })).toBe("bcd");
  });
  it("returns text across multiple lines joined by newlines", () => {
    const doc = createDocument("hello\nbig\nworld");
    expect(getRange(doc, { line: 0, col: 2 }, { line: 2, col: 2 })).toBe("llo\nbig\nwo");
  });
});

describe("insertMultiline", () => {
  it("inserts single-line text and reports the end position", () => {
    const doc = createDocument("ad");
    const r = insertMultiline(doc, { line: 0, col: 1 }, "bc");
    expect(getText(r.document)).toBe("abcd");
    expect(r.end).toEqual({ line: 0, col: 3 });
  });
  it("inserts multi-line text, splitting the target line", () => {
    const doc = createDocument("aZ");
    const r = insertMultiline(doc, { line: 0, col: 1 }, "b\ncc\nd");
    expect(r.document.lines).toEqual(["ab", "cc", "dZ"]);
    expect(r.end).toEqual({ line: 2, col: 1 });
  });
});

describe("hard/soft return flags", () => {
  it("createDocument marks all breaks hard", () => {
    const doc = createDocument("a\nb\nc");
    expect(doc.returns).toEqual(["hard", "hard", "hard"]);
  });

  it("splitLine defaults to a hard return, or records soft when asked", () => {
    const doc = createDocument("hello");
    expect(splitLine(doc, { line: 0, col: 2 }).returns).toEqual(["hard", "hard"]);
    expect(splitLine(doc, { line: 0, col: 2 }, "soft").returns).toEqual(["soft", "hard"]);
  });

  it("deleteRange across lines drops the removed breaks", () => {
    let doc = createDocument("aaa");
    doc = splitLine(doc, { line: 0, col: 1 }, "soft"); // a|aa -> ["a","aa"] soft
    doc = splitLine(doc, { line: 1, col: 1 }); // ["a","a","a"] soft,hard
    const next = deleteRange(doc, { line: 0, col: 1 }, { line: 1, col: 0 });
    expect(next.lines).toEqual(["aa", "a"]);
    expect(next.returns).toEqual(["hard", "hard"]);
  });

  it("insertMultiline inserts hard breaks", () => {
    const doc = createDocument("aZ");
    const r = insertMultiline(doc, { line: 0, col: 1 }, "b\ncc\nd");
    expect(r.document.returns).toEqual(["hard", "hard", "hard"]);
  });

  it("last return is always hard", () => {
    const doc = createDocument("only");
    expect(doc.returns).toEqual(["hard"]);
  });
});

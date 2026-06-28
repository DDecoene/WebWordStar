import { describe, it, expect } from "vitest";
import { createEditorState, lineLength, clampCursor, applyKey } from "../src/editor/state";

describe("createEditorState", () => {
  it("starts with an empty document, cursor at origin, insert mode", () => {
    const s = createEditorState();
    expect(s.document.lines).toEqual([""]);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    expect(s.mode).toBe("insert");
    expect(s.pending).toBeNull();
  });

  it("accepts initial text and a filename", () => {
    const s = createEditorState("hi\nthere", "DOC.TXT");
    expect(s.document.lines).toEqual(["hi", "there"]);
    expect(s.filename).toBe("DOC.TXT");
  });
});

describe("helpers", () => {
  it("lineLength returns the length of a given line", () => {
    const s = createEditorState("hello\nbye");
    expect(lineLength(s.document, 0)).toBe(5);
    expect(lineLength(s.document, 1)).toBe(3);
  });

  it("clampCursor keeps the cursor within the document", () => {
    const s = createEditorState("ab\ncde");
    expect(clampCursor(s.document, { line: 5, col: 9 })).toEqual({ line: 1, col: 3 });
    expect(clampCursor(s.document, { line: -1, col: -4 })).toEqual({ line: 0, col: 0 });
  });
});

describe("applyKey (unknown keys)", () => {
  it("returns the state unchanged for an unhandled key", () => {
    const s = createEditorState("abc");
    const next = applyKey(s, { key: "F1", ctrl: false });
    expect(next).toEqual(s);
  });
});

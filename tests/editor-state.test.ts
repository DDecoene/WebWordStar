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

describe("typing printable characters", () => {
  it("inserts a character and advances the cursor", () => {
    let s = createEditorState();
    s = applyKey(s, { key: "h", ctrl: false });
    s = applyKey(s, { key: "i", ctrl: false });
    expect(s.document.lines).toEqual(["hi"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it("inserts in the middle of existing text", () => {
    let s = createEditorState("ac");
    s = { ...s, cursor: { line: 0, col: 1 } };
    s = applyKey(s, { key: "b", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it("^V toggles overtype mode, which replaces the character under the cursor", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "v", ctrl: true });
    expect(s.mode).toBe("overtype");
    s = applyKey(s, { key: "X", ctrl: false });
    expect(s.document.lines).toEqual(["Xbc"]);
    expect(s.cursor).toEqual({ line: 0, col: 1 });
  });

  it("overtype at end of line appends rather than replacing past the end", () => {
    let s = createEditorState("ab");
    s = { ...s, mode: "overtype", cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
    expect(s.cursor).toEqual({ line: 0, col: 3 });
  });

  it("ignores control-modified keys as text (they are commands, not input)", () => {
    let s = createEditorState();
    s = applyKey(s, { key: "a", ctrl: true });
    expect(s.document.lines).toEqual([""]);
  });
});

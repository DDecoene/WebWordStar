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

describe("Enter / Backspace / ^G", () => {
  it("Enter splits the line and moves to the start of the new line", () => {
    let s = createEditorState("hello");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.document.lines).toEqual(["he", "llo"]);
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });

  it("Backspace removes the character to the left", () => {
    let s = createEditorState("abc");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.document.lines).toEqual(["ac"]);
    expect(s.cursor).toEqual({ line: 0, col: 1 });
  });

  it("Backspace at column 0 joins with the previous line", () => {
    let s = createEditorState("ab\ncd");
    s = { ...s, cursor: { line: 1, col: 0 } };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.document.lines).toEqual(["abcd"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });

  it("Backspace at the very start is a no-op", () => {
    let s = createEditorState("ab");
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.document.lines).toEqual(["ab"]);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });

  it("^G deletes the character to the right", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "g", ctrl: true });
    expect(s.document.lines).toEqual(["bc"]);
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });

  it("^G at end of line joins the next line", () => {
    let s = createEditorState("ab\ncd");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "g", ctrl: true });
    expect(s.document.lines).toEqual(["abcd"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });
});

describe("the diamond (character movement)", () => {
  const doc = "abc\ndef";
  it("^D moves right, wrapping to the next line at end of line", () => {
    let s = createEditorState(doc);
    s = { ...s, cursor: { line: 0, col: 3 } };
    s = applyKey(s, { key: "d", ctrl: true });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });
  it("^S moves left, wrapping to the previous line end", () => {
    let s = createEditorState(doc);
    s = { ...s, cursor: { line: 1, col: 0 } };
    s = applyKey(s, { key: "s", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 3 });
  });
  it("^E moves up, clamping the column to the shorter line", () => {
    let s = createEditorState("ab\nlonger");
    s = { ...s, cursor: { line: 1, col: 6 } };
    s = applyKey(s, { key: "e", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });
  it("^X moves down", () => {
    let s = createEditorState(doc);
    s = applyKey(s, { key: "x", ctrl: true });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });
  it("^S at the very start and ^D at the very end are no-ops", () => {
    let start = createEditorState(doc);
    expect(applyKey(start, { key: "s", ctrl: true }).cursor).toEqual({ line: 0, col: 0 });
    let end = { ...createEditorState(doc), cursor: { line: 1, col: 3 } };
    expect(applyKey(end, { key: "d", ctrl: true }).cursor).toEqual({ line: 1, col: 3 });
  });
});

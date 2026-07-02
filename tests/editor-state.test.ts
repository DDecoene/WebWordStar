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

describe("word movement (^A / ^F)", () => {
  it("^F moves to the start of the next word on the line", () => {
    let s = createEditorState("foo bar baz");
    s = applyKey(s, { key: "f", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 4 });
    s = applyKey(s, { key: "f", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 8 });
  });
  it("^A moves to the start of the current/previous word", () => {
    let s = createEditorState("foo bar baz");
    s = { ...s, cursor: { line: 0, col: 9 } };
    s = applyKey(s, { key: "a", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 8 });
    s = applyKey(s, { key: "a", ctrl: true });
    expect(s.cursor).toEqual({ line: 0, col: 4 });
  });
  it("^F at end of line moves to the start of the next line", () => {
    let s = createEditorState("ab\ncd");
    s = { ...s, cursor: { line: 0, col: 2 } };
    s = applyKey(s, { key: "f", ctrl: true });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
  });
});

import { orderedBlock } from "../src/editor/state";

describe("^K block marking", () => {
  it("^K sets a pending block prefix without changing the document", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    expect(s.pending).toBe("block");
    expect(s.document.lines).toEqual(["abc"]);
  });
  it("^KB marks block begin at the cursor; ^KK marks block end", () => {
    let s = createEditorState("hello world");
    s = { ...s, cursor: { line: 0, col: 0 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "b", ctrl: false });
    expect(s.blockStart).toEqual({ line: 0, col: 0 });
    expect(s.pending).toBeNull();
    s = { ...s, cursor: { line: 0, col: 5 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "k", ctrl: false });
    expect(s.blockEnd).toEqual({ line: 0, col: 5 });
  });
  it("orderedBlock returns sorted markers or null", () => {
    let s = createEditorState("abcdef");
    expect(orderedBlock(s)).toBeNull();
    s = { ...s, blockStart: { line: 0, col: 4 }, blockEnd: { line: 0, col: 1 } };
    expect(orderedBlock(s)).toEqual({ start: { line: 0, col: 1 }, end: { line: 0, col: 4 } });
  });
  it("^KH toggles the block hidden flag", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "h", ctrl: false });
    expect(s.hideBlock).toBe(true);
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "h", ctrl: false });
    expect(s.hideBlock).toBe(false);
  });
});

describe("^KC copy / ^KY delete", () => {
  function markBlock(s: ReturnType<typeof createEditorState>, start: { line: number; col: number }, end: { line: number; col: number }) {
    s = { ...s, cursor: start };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "b", ctrl: false });
    s = { ...s, cursor: end };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "k", ctrl: false });
    return s;
  }

  it("^KC copies the block to the cursor and clears the markers", () => {
    let s = createEditorState("abcXY");
    s = markBlock(s, { line: 0, col: 0 }, { line: 0, col: 3 }); // "abc"
    s = { ...s, cursor: { line: 0, col: 5 } }; // end of line
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abcXYabc"]);
    expect(s.cursor).toEqual({ line: 0, col: 8 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("^KC copies a multi-line block", () => {
    let s = createEditorState("ab\ncd\n");
    s = markBlock(s, { line: 0, col: 0 }, { line: 1, col: 2 }); // "ab\ncd"
    s = { ...s, cursor: { line: 2, col: 0 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["ab", "cd", "ab", "cd"]);
    expect(s.cursor).toEqual({ line: 3, col: 2 });
  });

  it("^KY deletes the block, moves the cursor to its start, and clears markers", () => {
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 1 }, { line: 0, col: 4 }); // "bcd"
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "y", ctrl: false });
    expect(s.document.lines).toEqual(["aef"]);
    expect(s.cursor).toEqual({ line: 0, col: 1 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("^KC with cursor inside the block copies and clears both markers", () => {
    // "abcdef", block is col 1..4 ("bcd"), cursor at col 2 (inside the block)
    // getRange gives "bcd"; insertMultiline at col 2 into "abcdef" yields "ab" + "bcd" + "cdef" = "abbcdcdef"
    // cursor ends at col 2 + 3 = col 5
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 1 }, { line: 0, col: 4 }); // "bcd"
    s = { ...s, cursor: { line: 0, col: 2 } }; // inside block
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abbcdcdef"]);
    expect(s.cursor).toEqual({ line: 0, col: 5 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("^KC with no block set is a no-op", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
  });
});

describe("block move ^KV", () => {
  function markBlock(s: ReturnType<typeof createEditorState>, start: { line: number; col: number }, end: { line: number; col: number }) {
    s = { ...s, cursor: start };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "b", ctrl: false });
    s = { ...s, cursor: end };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "k", ctrl: false });
    return s;
  }

  it("moves a block forward (block before cursor)", () => {
    // "abcdef", block [0,1)-[0,3) ("bc"), cursor at col 6.
    // Delete "bc" -> "adef"; cursor col 6 maps to col 4; insert "bc" at 4 -> "adefbc".
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 1 }, { line: 0, col: 3 });
    s = { ...s, cursor: { line: 0, col: 6 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "v", ctrl: false });
    expect(s.document.lines).toEqual(["adefbc"]);
    expect(s.cursor).toEqual({ line: 0, col: 6 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("moves a block backward (cursor before block)", () => {
    // "abcdef", block [0,3)-[0,5) ("de"), cursor at col 0.
    // Insert "de" at col 0 -> "deabcdef" minus removed range... compute: delete "de" -> "abcf";
    // insert "de" at col 0 -> "deabcf"; cursor ends at col 2.
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 3 }, { line: 0, col: 5 });
    s = { ...s, cursor: { line: 0, col: 0 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "v", ctrl: false });
    expect(s.document.lines).toEqual(["deabcf"]);
    expect(s.cursor).toEqual({ line: 0, col: 2 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("moves a multi-line block across lines", () => {
    let s = createEditorState("ab\ncd\nef\n");
    s = markBlock(s, { line: 0, col: 0 }, { line: 1, col: 2 }); // "ab\ncd"
    s = { ...s, cursor: { line: 3, col: 0 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "v", ctrl: false });
    // deleteRange("ab\ncd") from lines ["ab","cd","ef",""] leaves ["","ef",""].
    // cursor was on line 3, col 0 (after end.line=1): shifts up by (1-0)=1 -> line 2.
    // insert "ab\ncd" at {line:2, col:0} -> ["","ef","ab","cd"].
    expect(s.document.lines).toEqual(["", "ef", "ab", "cd"]);
    expect(s.cursor).toEqual({ line: 3, col: 2 });
    expect(s.blockStart).toBeNull();
    expect(s.blockEnd).toBeNull();
  });

  it("is a no-op when the cursor is inside the block", () => {
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 1 }, { line: 0, col: 4 }); // "bcd"
    s = { ...s, cursor: { line: 0, col: 2 } }; // inside block
    const before = s.document;
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "v", ctrl: false });
    expect(s.document).toBe(before);
    expect(s.blockStart).toEqual({ line: 0, col: 1 });
    expect(s.blockEnd).toEqual({ line: 0, col: 4 });
  });

  it("is a no-op when markers are unset", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "v", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
  });

  it("undo restores the pre-move document", () => {
    let s = createEditorState("abcdef");
    s = markBlock(s, { line: 0, col: 1 }, { line: 0, col: 3 });
    s = { ...s, cursor: { line: 0, col: 6 } };
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "v", ctrl: false });
    expect(s.document.lines).toEqual(["adefbc"]);
    s = applyKey(s, { key: "u", ctrl: true });
    expect(s.document.lines).toEqual(["abcdef"]);
  });
});

describe("arrow-key movement alternates", () => {
  it("ArrowRight / ArrowLeft move like ^D / ^S", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "ArrowRight", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 1 });
    s = applyKey(s, { key: "ArrowLeft", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });
  it("ArrowDown / ArrowUp move like ^X / ^E", () => {
    let s = createEditorState("ab\ncd");
    s = applyKey(s, { key: "ArrowDown", ctrl: false });
    expect(s.cursor).toEqual({ line: 1, col: 0 });
    s = applyKey(s, { key: "ArrowUp", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });
  it("arrow keys do not insert text", () => {
    let s = createEditorState("");
    s = applyKey(s, { key: "ArrowRight", ctrl: false });
    expect(s.document.lines).toEqual([""]);
  });
});

describe("^Q quick movement prefix", () => {
  it("^Q sets a pending prefix without changing the document", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "q", ctrl: true });
    expect(s.pending).toBe("quick");
    expect(s.document.lines).toEqual(["abc"]);
  });
  it("^Q S goes to start of line; ^Q D to end of line", () => {
    let s = createEditorState("hello world");
    s = { ...s, cursor: { line: 0, col: 5 } };
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "s", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    expect(s.pending).toBeNull();
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "d", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 11 });
  });
  it("^Q R goes to start of document; ^Q C to end of document", () => {
    let s = createEditorState("one\ntwo\nthree");
    s = { ...s, cursor: { line: 1, col: 1 } };
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.cursor).toEqual({ line: 2, col: 5 });
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "r", ctrl: false });
    expect(s.cursor).toEqual({ line: 0, col: 0 });
  });
  it("an unrecognized key after ^Q just clears the prefix", () => {
    let s = createEditorState("abc");
    s = applyKey(s, { key: "q", ctrl: true });
    s = applyKey(s, { key: "z", ctrl: false });
    expect(s.pending).toBeNull();
    expect(s.cursor).toEqual({ line: 0, col: 0 });
    expect(s.document.lines).toEqual(["abc"]);
  });
});

describe("undo/redo", () => {
  function undo(s: ReturnType<typeof createEditorState>) {
    return applyKey(s, { key: "u", ctrl: true });
  }
  function redo(s: ReturnType<typeof createEditorState>) {
    s = applyKey(s, { key: "q", ctrl: true });
    return applyKey(s, { key: "u", ctrl: false });
  }

  it("typing 3 chars then ^U restores the original doc and cursor in one step", () => {
    let s = createEditorState("");
    const original = { document: s.document, cursor: s.cursor };
    s = applyKey(s, { key: "a", ctrl: false });
    s = applyKey(s, { key: "b", ctrl: false });
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines).toEqual(["abc"]);
    s = undo(s);
    expect(s.document.lines).toEqual(original.document.lines);
    expect(s.cursor).toEqual(original.cursor);
  });

  it("backspaces coalesce as their own run, separate from typing", () => {
    let s = createEditorState("");
    s = applyKey(s, { key: "a", ctrl: false });
    s = applyKey(s, { key: "b", ctrl: false });
    // seal the typing chunk with a movement
    s = applyKey(s, { key: "ArrowLeft", ctrl: false });
    const beforeBackspaces = { document: s.document, cursor: s.cursor };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    s = { ...s, cursor: { line: 0, col: 0 } }; // reposition without going through applyKey
    expect(s.document.lines).toEqual(["b"]);
    s = undo(s);
    expect(s.document.lines).toEqual(beforeBackspaces.document.lines);
    expect(s.cursor).toEqual(beforeBackspaces.cursor);
  });

  it("movement seals a chunk: type 'a', move left, type 'b' -> two undo steps", () => {
    let s = createEditorState("");
    s = applyKey(s, { key: "a", ctrl: false });
    s = applyKey(s, { key: "ArrowLeft", ctrl: false });
    s = applyKey(s, { key: "b", ctrl: false });
    expect(s.document.lines).toEqual(["ba"]);
    s = undo(s);
    expect(s.document.lines).toEqual(["a"]);
    s = undo(s);
    expect(s.document.lines).toEqual([""]);
  });

  it("^Q U redoes what ^U undid", () => {
    let s = createEditorState("");
    s = applyKey(s, { key: "a", ctrl: false });
    s = applyKey(s, { key: "b", ctrl: false });
    s = applyKey(s, { key: "c", ctrl: false });
    s = undo(s);
    expect(s.document.lines).toEqual([""]);
    s = redo(s);
    expect(s.document.lines).toEqual(["abc"]);
  });

  it("a new edit after ^U clears the redo stack", () => {
    let s = createEditorState("");
    s = applyKey(s, { key: "a", ctrl: false });
    s = applyKey(s, { key: "b", ctrl: false });
    s = undo(s);
    expect(s.history.redo.length).toBe(1);
    s = applyKey(s, { key: "z", ctrl: false });
    expect(s.history.redo.length).toBe(0);
  });

  it("caps the undo stack at 200 snapshots", () => {
    let s = createEditorState("");
    for (let i = 0; i < 250; i++) {
      s = applyKey(s, { key: "a", ctrl: false });
      s = applyKey(s, { key: "ArrowLeft", ctrl: false }); // seal chunk each time
    }
    expect(s.history.undo.length).toBe(200);
  });

  it("^U on an empty undo stack is a no-op", () => {
    let s = createEditorState("abc");
    s = undo(s);
    expect(s.document.lines).toEqual(["abc"]);
  });
});

describe("^O onscreen format", () => {
  function ctrl(key: string) {
    return { key, ctrl: true };
  }
  function type(s: ReturnType<typeof createEditorState>, text: string) {
    for (const ch of text) s = applyKey(s, { key: ch, ctrl: false });
    return s;
  }

  it("has sensible ruler defaults", () => {
    const s = createEditorState("");
    expect(s.ruler.left).toBe(0);
    expect(s.ruler.right).toBe(65);
    expect(s.ruler.tabs).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(s.ruler.spacing).toBe(1);
    expect(s.ruler.justify).toBe(false);
    expect(s.ruler.wordWrap).toBe(true);
    expect(s.ruler.showRuler).toBe(true);
    expect(s.showControls).toBe(true);
    expect(s.marginRelease).toBe(false);
    expect(s.tempIndent).toBeNull();
  });

  it("^O L prompts and commits left margin", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "l", ctrl: false });
    expect(s.prompt?.label).toBe("LEFT MARGIN:");
    s = type(s, "5");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.prompt).toBeNull();
    expect(s.ruler.left).toBe(4);
  });

  it("^O R prompts and commits right margin", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "r", ctrl: false });
    s = type(s, "70");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.ruler.right).toBe(69);
  });

  it("rejects left margin >= right margin", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "l", ctrl: false });
    s = type(s, "70"); // 0-based 69, right is 65 by default -> reject
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.prompt).toBeNull();
    expect(s.ruler.left).toBe(0);
  });

  it("rejects non-numeric margin input", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "l", ctrl: false });
    s = type(s, "abc");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.prompt).toBeNull();
    expect(s.ruler.left).toBe(0);
  });

  it("^O J / ^O W / ^O T / ^O D toggle", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "j", ctrl: false });
    expect(s.ruler.justify).toBe(true);

    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "w", ctrl: false });
    expect(s.ruler.wordWrap).toBe(false);

    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "t", ctrl: false });
    expect(s.ruler.showRuler).toBe(false);

    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "d", ctrl: false });
    expect(s.showControls).toBe(false);
  });

  it("^O C centers the current line and is undoable", () => {
    let s = createEditorState("hi");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "r", ctrl: false });
    s = type(s, "10");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.ruler.right).toBe(9);

    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "c", ctrl: false });
    expect(s.document.lines[0]).toBe("    hi");

    s = applyKey(s, ctrl("u"));
    expect(s.document.lines[0]).toBe("hi");
  });

  it("^O I / ^O N add and remove a tab stop at the cursor column", () => {
    let s = createEditorState("abcdefgh");
    s = { ...s, cursor: { line: 0, col: 3 } };
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "i", ctrl: false });
    expect(s.ruler.tabs).toContain(3);

    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "n", ctrl: false });
    expect(s.ruler.tabs).not.toContain(3);
  });

  it("^O S prompts spacing; valid commits, invalid rejects", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "s", ctrl: false });
    s = type(s, "2");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.ruler.spacing).toBe(2);

    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "s", ctrl: false });
    s = type(s, "0");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.ruler.spacing).toBe(2); // rejected, unchanged
  });

  it("^O X sets margin release", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "x", ctrl: false });
    expect(s.marginRelease).toBe(true);
  });

  it("^O G sets temp indent to the next tab stop", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "g", ctrl: false });
    expect(s.tempIndent).toBe(5);
  });

  it("Enter clears tempIndent and marginRelease", () => {
    let s = createEditorState("");
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "g", ctrl: false });
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "x", ctrl: false });
    expect(s.tempIndent).toBe(5);
    expect(s.marginRelease).toBe(true);
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.tempIndent).toBeNull();
    expect(s.marginRelease).toBe(false);
  });

  it("^KN still works alongside the new prompt target machinery", () => {
    let s = createEditorState("", "UNTITLED");
    s = applyKey(s, ctrl("k"));
    s = applyKey(s, { key: "n", ctrl: false });
    s = type(s, "MYDOC");
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.filename).toBe("MYDOC");
  });
});

describe("word wrap", () => {
  function ctrl(key: string) {
    return { key, ctrl: true };
  }
  function type(s: ReturnType<typeof createEditorState>, text: string) {
    for (const ch of text) s = applyKey(s, { key: ch, ctrl: false });
    return s;
  }
  function narrowRuler(s: ReturnType<typeof createEditorState>, right: number) {
    return { ...s, ruler: { ...s.ruler, right } };
  }

  it("typing past the right margin moves the current word to a new soft-return line", () => {
    let s = createEditorState("");
    s = narrowRuler(s, 6); // maxWidth = 7
    s = type(s, "aaa bbb");
    // "aaa bbb" is width 7, fits exactly. Typing one more char overflows.
    s = type(s, "c");
    expect(s.document.lines[0]).toBe("aaa");
    expect(s.document.lines[1]).toBe("bbbc");
    expect(s.document.returns[0]).toBe("soft");
    expect(s.cursor).toEqual({ line: 1, col: 4 });
  });

  it("^O X (margin release) suppresses wrap for the current line", () => {
    let s = createEditorState("");
    s = narrowRuler(s, 6);
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "x", ctrl: false });
    s = type(s, "aaa bbbc");
    expect(s.document.lines).toEqual(["aaa bbbc"]);
  });

  it("^O W (word wrap off) disables wrapping", () => {
    let s = createEditorState("");
    s = narrowRuler(s, 6);
    s = applyKey(s, ctrl("o"));
    s = applyKey(s, { key: "w", ctrl: false });
    expect(s.ruler.wordWrap).toBe(false);
    s = type(s, "aaa bbbc");
    expect(s.document.lines).toEqual(["aaa bbbc"]);
  });

  it("^B reflows a manually-constructed ragged paragraph", () => {
    let s = createEditorState("the quick\nbrown fox\njumps");
    s = narrowRuler(s, 10);
    s = { ...s, document: { ...s.document, returns: ["soft", "soft", "hard"] } };
    s = applyKey(s, ctrl("b"));
    expect(s.document.lines.join("|")).toBe("the quick|brown fox|jumps");
  });

  it("^B is undoable with ^U", () => {
    let s = createEditorState("the\nquick\nbrown\nfox\njumps");
    s = narrowRuler(s, 10);
    s = { ...s, document: { ...s.document, returns: ["soft", "soft", "soft", "soft", "hard"] } };
    const before = s.document.lines.slice();
    s = applyKey(s, ctrl("b"));
    expect(s.document.lines).not.toEqual(before);
    s = applyKey(s, ctrl("u"));
    expect(s.document.lines).toEqual(before);
  });
});

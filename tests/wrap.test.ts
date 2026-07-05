import { describe, it, expect } from "vitest";
import { displayWidth, wrapPoint, reflowParagraph } from "../src/shared/wrap";
import { createDocument } from "../src/shared/document";

describe("displayWidth", () => {
  it("counts plain text length", () => {
    expect(displayWidth("hello")).toBe(5);
  });

  it("ignores zero-width control characters", () => {
    expect(displayWidth("\x02hello\x04")).toBe(5);
    expect(displayWidth("a\x13b\x19c\x18d\x14e\x16f")).toBe(6);
  });

  it("counts the non-breaking-space marker as width 1", () => {
    expect(displayWidth("a\x0Fb")).toBe(3);
  });
});

describe("wrapPoint", () => {
  it("returns null when the line fits", () => {
    expect(wrapPoint("short line", 65, 0)).toBeNull();
  });

  it("breaks after the last space that fits within the margin", () => {
    // right=6 -> maxWidth=7. "aaa bbb ccc" (11 chars) overflows.
    const idx = wrapPoint("aaa bbb ccc", 6, 0);
    expect(idx).toBe(4); // just after "aaa "
  });

  it("does not treat the non-breaking space (\\x0F) as a break point", () => {
    // "aaa\x0Fbbb ccc" - the only real space is after "aaa\x0Fbbb"
    const line = "aaa" + "\x0F" + "bbb ccc";
    const idx = wrapPoint(line, 6, 0);
    // displayWidth of "aaa\x0Fbbb" = 7, "aaa\x0Fbbb ccc" = 11 -> overflow
    // the space is at index 7 (after aaa\x0Fbbb), col at that point = 7 which is > maxWidth-1(6)
    // so no breakable space fits within margin -> falls back to mid-word break at col 7
    expect(idx).toBe(7);
  });

  it("breaks mid-word at the margin when there is no fitting space", () => {
    const idx = wrapPoint("aaaaaaaaaaaaaa", 6, 0); // single long word, maxWidth=7
    expect(idx).toBe(7);
  });
});

describe("reflowParagraph", () => {
  const ruler = { left: 0, right: 10, justify: false };

  it("joins a soft-broken run and rewraps at the margins", () => {
    let doc = createDocument("the quick\nbrown fox\njumps");
    // Make first two breaks soft (one paragraph), last stays hard.
    doc = { ...doc, returns: ["soft", "soft", "hard"] };
    const { document } = reflowParagraph(doc, 0, ruler, { line: 0, col: 0 });
    // joined: "the quick brown fox jumps" (25 chars), width 11 (right+1=11)
    expect(document.lines.join("|")).toBe("the quick|brown fox|jumps");
    expect(document.returns).toEqual(["soft", "soft", "hard"]);
  });

  it("respects the left margin indent on every produced line", () => {
    let doc = createDocument("the quick\nbrown fox\njumps");
    doc = { ...doc, returns: ["soft", "soft", "hard"] };
    const indentedRuler = { left: 2, right: 12, justify: false };
    const { document } = reflowParagraph(doc, 0, indentedRuler, { line: 0, col: 0 });
    for (const line of document.lines) {
      expect(line.startsWith("  ")).toBe(true);
    }
  });

  it("stops at the next hard return, leaving the following paragraph untouched", () => {
    let doc = createDocument("aa bb\ncc dd\nSECOND PARAGRAPH LINE");
    doc = { ...doc, returns: ["soft", "hard", "hard"] };
    const { document } = reflowParagraph(doc, 0, ruler, { line: 0, col: 0 });
    expect(document.lines[document.lines.length - 1]).toBe("SECOND PARAGRAPH LINE");
  });

  it("justify pads interior gaps on all lines but the last", () => {
    let doc = createDocument("aaa bbb ccc\nddd");
    doc = { ...doc, returns: ["soft", "hard"] };
    const justifyRuler = { left: 0, right: 10, justify: true };
    const { document } = reflowParagraph(doc, 0, justifyRuler, { line: 0, col: 0 });
    // first output line should be padded to width 11 (right+1), last line untouched.
    const lines = document.lines;
    const last = lines[lines.length - 1]!;
    expect(last).toBe("ddd");
    for (const line of lines.slice(0, -1)) {
      expect(line.length).toBe(11);
    }
  });

  it("tracks a cursor position through the reflow by character offset", () => {
    let doc = createDocument("the quick\nbrown fox\njumps");
    doc = { ...doc, returns: ["soft", "soft", "hard"] };
    // track cursor at "fox" start: line 1, col 6 ("brown fox" -> f is at col 6)
    const { document, position } = reflowParagraph(doc, 0, ruler, { line: 1, col: 6 });
    const joinedUpToLine = document.lines.slice(0, position.line).join(" ");
    const charAtTrackedPos = document.lines[position.line]![position.col];
    void joinedUpToLine;
    // Whatever line/col it lands on, that character should be 'f' (start of "fox")
    expect(charAtTrackedPos).toBe("f");
  });
});

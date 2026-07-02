import { describe, it, expect } from "vitest";
import { createDocument } from "../src/shared/document";
import { paginate } from "../src/shared/page";

const base = { left: 0, right: 65, spacing: 1 };

function repeat(text: string, times: number): string {
  return new Array(times).fill(text).join("\n");
}

describe("paginate", () => {
  it("empty document is one page with no breaks", () => {
    const doc = createDocument("");
    const result = paginate(doc, base);
    expect(result.breaks).toEqual([]);
    expect(result.pageOfLine).toEqual([0]);
    expect(result.pageNumbers).toEqual([1]);
    expect(result.omit).toEqual([false]);
  });

  it("short document has no breaks", () => {
    const doc = createDocument("one\ntwo\nthree");
    const result = paginate(doc, base);
    expect(result.breaks).toEqual([]);
    expect(result.pageOfLine).toEqual([0, 0, 0]);
    expect(result.pageNumbers).toEqual([1]);
  });

  it("60 text lines with default base breaks after line 54", () => {
    const doc = createDocument(repeat("line", 60));
    const result = paginate(doc, base);
    expect(result.breaks).toEqual([54]);
    expect(result.pageOfLine.slice(0, 55)).toEqual(new Array(55).fill(0));
    expect(result.pageOfLine.slice(55)).toEqual(new Array(5).fill(1));
    expect(result.pageNumbers).toEqual([1, 2]);
  });

  it("dot lines cost zero height and don't force an early break", () => {
    // 55 text lines interleaved with a dot line every other line: still one page.
    const lines: string[] = [];
    for (let i = 0; i < 55; i++) {
      lines.push("line");
      lines.push(".he Title");
    }
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    expect(result.breaks).toEqual([]);
  });

  it("the 56th text line pushes onto a new page even with dot lines interspersed", () => {
    const lines: string[] = [];
    for (let i = 0; i < 56; i++) {
      lines.push("line");
      lines.push(".he Title");
    }
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    expect(result.breaks.length).toBe(1);
    // the break happens right before the 56th text line, which is at doc index 110
    const textLineIndices = doc.lines
      .map((l, idx) => ({ l, idx }))
      .filter((x) => x.l === "line")
      .map((x) => x.idx);
    expect(textLineIndices.length).toBe(56);
    const fifty6thTextLineIdx = textLineIndices[55]!;
    expect(result.pageOfLine[fifty6thTextLineIdx]).toBe(1);
    expect(result.pageOfLine[fifty6thTextLineIdx - 1]).toBe(0);
  });

  it(".pa forces a page break for the following line; .pa itself stays on the old page", () => {
    const doc = createDocument("one\ntwo\n.pa\nthree\nfour");
    const result = paginate(doc, base);
    // lines: 0 one, 1 two, 2 .pa, 3 three, 4 four
    expect(result.pageOfLine[0]).toBe(0);
    expect(result.pageOfLine[1]).toBe(0);
    expect(result.pageOfLine[2]).toBe(0); // .pa itself sits on old page
    expect(result.pageOfLine[3]).toBe(1); // forced break before this line
    expect(result.pageOfLine[4]).toBe(1);
    expect(result.breaks).toEqual([2]);
  });

  it(".cp n breaks early when fewer than n slots remain", () => {
    // capacity 55. Fill 53 lines (used=53, remaining=2), then .cp 5 needs 5 slots -> breaks.
    const lines = new Array(53).fill("line");
    lines.push(".cp 5");
    lines.push("after");
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    expect(result.breaks).toEqual([52]);
    // .cp line (index 53) and what follows land on the new page.
    expect(result.pageOfLine[53]).toBe(1);
    expect(result.pageOfLine[54]).toBe(1);
  });

  it(".cp n does not break when enough slots remain", () => {
    const lines = new Array(10).fill("line");
    lines.push(".cp 5");
    lines.push("after");
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    expect(result.breaks).toEqual([]);
  });

  it(".ls 2 halves how many lines fit per page", () => {
    // capacity 55; with ls=2, 27 lines fit (54 rows), 28th doesn't (56 rows > 55).
    const lines = [".ls 2", ...new Array(28).fill("line")];
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    expect(result.breaks.length).toBe(1);
    // line indices: 0 is ".ls 2", 1..28 are text lines
    expect(result.pageOfLine[27]).toBe(0); // 27th text line (index 27) still fits
    expect(result.pageOfLine[28]).toBe(1); // 28th text line (index 28) overflows
  });

  it(".pn n renumbers the page the following content lands on", () => {
    // Force two breaks so we get 3 pages, with .pn 5 landing right before the
    // start of page 1's content.
    const page0 = new Array(55).fill("line"); // fills page 0 exactly
    const lines = [...page0, ".pn 5", ...new Array(56).fill("line")];
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    expect(result.pageNumbers).toEqual([1, 5, 6]);
  });

  it(".op omits page numbering from that page forward", () => {
    const page0 = new Array(55).fill("line");
    const lines = [...page0, ".op", ...new Array(10).fill("line")];
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    // .op lands on page 0 itself (the page still being filled), so omission
    // starts there and carries forward to every later page.
    expect(result.omit).toEqual([true, true]);
  });

  it("mid-document .pl applies starting the next page only", () => {
    // Default capacity 55. Insert .pl reducing page length so subsequent pages are shorter,
    // but the current page (already sized at 55) is unaffected.
    const lines = new Array(55).fill("line");
    lines.push(".pl 20"); // pl 20 -> capacity 20-3-8=9, effective next page
    lines.push(...new Array(9).fill("line"));
    lines.push("overflow");
    const doc = createDocument(lines.join("\n"));
    const result = paginate(doc, base);
    // page 0 still holds all 55 original lines (the .pl line sits on page 0 too).
    expect(result.pageOfLine.slice(0, 56)).toEqual(new Array(56).fill(0));
    // page 1 has capacity 9: the 9 "line"s after .pl fit, "overflow" doesn't.
    const nineLinesStart = 56;
    expect(result.pageOfLine.slice(nineLinesStart, nineLinesStart + 9)).toEqual(new Array(9).fill(1));
    expect(result.pageOfLine[nineLinesStart + 9]).toBe(2);
  });
});

import { describe, it, expect } from "vitest";
import { createDocument } from "../src/shared/document";
import { isDotLine, parseDotLine, scanLayout, type DotCommand } from "../src/shared/dot";

describe("isDotLine", () => {
  it("true when first char is a dot", () => {
    expect(isDotLine(".lm 5")).toBe(true);
  });
  it("false otherwise", () => {
    expect(isDotLine("hello")).toBe(false);
    expect(isDotLine("")).toBe(false);
    expect(isDotLine(" .lm 5")).toBe(false);
  });
});

describe("parseDotLine", () => {
  it("returns null for non-dot lines", () => {
    expect(parseDotLine("hello")).toBeNull();
    expect(parseDotLine("")).toBeNull();
  });

  const numeric: [string, DotCommand["kind"]][] = [
    ["lm", "lm"],
    ["rm", "rm"],
    ["ls", "ls"],
    ["pl", "pl"],
    ["mt", "mt"],
    ["mb", "mb"],
    ["cp", "cp"],
  ];

  for (const [word, kind] of numeric) {
    it(`parses .${word} N`, () => {
      expect(parseDotLine(`.${word} 5`)).toEqual({ kind, value: 5 });
    });
    it(`is case-insensitive and tolerant of extra spaces for .${word}`, () => {
      expect(parseDotLine(`.${word.toUpperCase()}  7`)).toEqual({ kind, value: 7 });
    });
    it(`.${word} with invalid arg -> unknown`, () => {
      expect(parseDotLine(`.${word} abc`)).toEqual({ kind: "unknown" });
      expect(parseDotLine(`.${word} 0`)).toEqual({ kind: "unknown" });
      expect(parseDotLine(`.${word} -3`)).toEqual({ kind: "unknown" });
      expect(parseDotLine(`.${word}`)).toEqual({ kind: "unknown" });
    });
  }

  it("parses .pn N", () => {
    expect(parseDotLine(".pn 3")).toEqual({ kind: "pn", value: 3 });
  });
  it(".pn invalid -> unknown", () => {
    expect(parseDotLine(".pn abc")).toEqual({ kind: "unknown" });
    expect(parseDotLine(".pn 0")).toEqual({ kind: "unknown" });
  });

  it("parses .pa with no arg", () => {
    expect(parseDotLine(".pa")).toEqual({ kind: "pa" });
    expect(parseDotLine(".pa   ")).toEqual({ kind: "pa" });
  });
  it(".pa with junk trailing -> unknown", () => {
    expect(parseDotLine(".pa foo")).toEqual({ kind: "unknown" });
  });

  it("parses .op with no arg", () => {
    expect(parseDotLine(".op")).toEqual({ kind: "op" });
  });
  it(".op with junk trailing -> unknown", () => {
    expect(parseDotLine(".op foo")).toEqual({ kind: "unknown" });
  });

  it("parses .he text verbatim after stripping one leading space", () => {
    expect(parseDotLine(".he Title")).toEqual({ kind: "he", text: "Title" });
    expect(parseDotLine(".he  Title")).toEqual({ kind: "he", text: " Title" });
  });
  it("parses .fo text verbatim after stripping one leading space", () => {
    expect(parseDotLine(".fo Footer")).toEqual({ kind: "fo", text: "Footer" });
  });
  it(".he/.fo with empty text", () => {
    expect(parseDotLine(".he")).toEqual({ kind: "he", text: "" });
  });
  it("case-insensitive command word for .he/.fo", () => {
    expect(parseDotLine(".HE Title")).toEqual({ kind: "he", text: "Title" });
  });

  it("unknown command word -> unknown", () => {
    expect(parseDotLine(".xx 5")).toEqual({ kind: "unknown" });
    expect(parseDotLine(".")).toEqual({ kind: "unknown" });
  });
});

describe("scanLayout", () => {
  const base = { left: 0, right: 65, spacing: 1 };

  it("passes through base with defaults when no dot commands", () => {
    const doc = createDocument("hello\nworld");
    const layout = scanLayout(doc, 2, base);
    expect(layout).toEqual({
      left: 0,
      right: 65,
      spacing: 1,
      pageLen: 66,
      marginTop: 3,
      marginBottom: 8,
      header: "",
      footer: "",
      pageNumber: null,
      omitPageNumbers: false,
    });
  });

  it("folds dot commands strictly before uptoLine", () => {
    const doc = createDocument(".lm 5\ntext");
    // uptoLine 0: nothing folded yet (line 0 itself is the command line, not before it)
    expect(scanLayout(doc, 0, base).left).toBe(0);
    // uptoLine 1: the .lm on line 0 is folded (1-based col 5 -> 0-based 4)
    expect(scanLayout(doc, 1, base).left).toBe(4);
  });

  it("1-based margins convert to 0-based", () => {
    const doc = createDocument(".rm 66\ntext");
    expect(scanLayout(doc, 1, base).right).toBe(65);
  });

  it("chained overrides use the latest value", () => {
    const doc = createDocument(".lm 5\ntext\n.lm 10\nmore");
    expect(scanLayout(doc, 2, base).left).toBe(4);
    expect(scanLayout(doc, 4, base).left).toBe(9);
  });

  it("ignores lm/rm override that would make left >= right", () => {
    const doc = createDocument(".rm 5\n.lm 10\ntext");
    // .rm 5 -> 0-based right = 4
    // .lm 10 -> 0-based left = 9, which is >= right(4) -> ignored
    const layout = scanLayout(doc, 3, base);
    expect(layout.right).toBe(4);
    expect(layout.left).toBe(0);
  });

  it("ls overrides spacing", () => {
    const doc = createDocument(".ls 2\ntext");
    expect(scanLayout(doc, 1, base).spacing).toBe(2);
  });

  it("pl/mt/mb override page settings", () => {
    const doc = createDocument(".pl 50\n.mt 4\n.mb 6\ntext");
    const layout = scanLayout(doc, 3, base);
    expect(layout.pageLen).toBe(50);
    expect(layout.marginTop).toBe(4);
    expect(layout.marginBottom).toBe(6);
  });

  it("he/fo replace header/footer", () => {
    const doc = createDocument(".he Title\n.fo Footer\ntext");
    const layout = scanLayout(doc, 2, base);
    expect(layout.header).toBe("Title");
    expect(layout.footer).toBe("Footer");
  });

  it("pn sets pageNumber to the last seen value before uptoLine", () => {
    const doc = createDocument(".pn 5\ntext\n.pn 9\nmore");
    expect(scanLayout(doc, 1, base).pageNumber).toBe(5);
    expect(scanLayout(doc, 3, base).pageNumber).toBe(9);
  });

  it("op sets omitPageNumbers", () => {
    const doc = createDocument(".op\ntext");
    expect(scanLayout(doc, 1, base).omitPageNumbers).toBe(true);
    expect(scanLayout(doc, 0, base).omitPageNumbers).toBe(false);
  });

  it("non-dot and unknown lines have no effect", () => {
    const doc = createDocument("hello\n.zz 5\nworld");
    const layout = scanLayout(doc, 3, base);
    expect(layout.left).toBe(0);
    expect(layout.right).toBe(65);
  });

  it("base pageLen/marginTop/marginBottom overrides are honored when supplied", () => {
    const doc = createDocument("text");
    const layout = scanLayout(doc, 1, { left: 0, right: 65, spacing: 1, pageLen: 50, marginTop: 2, marginBottom: 4 });
    expect(layout.pageLen).toBe(50);
    expect(layout.marginTop).toBe(2);
    expect(layout.marginBottom).toBe(4);
  });
});

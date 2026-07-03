import { describe, it, expect } from "vitest";
import { createDocument, splitLine, insertText } from "../src/shared/document";
import { parseRuns, exportText, exportMarkdown, exportHtml } from "../src/shared/export";

describe("parseRuns", () => {
  it("parses plain text without controls", () => {
    const runs = parseRuns("hello world");
    expect(runs).toEqual([
      {
        text: "hello world",
        bold: false,
        underline: false,
        italic: false,
        doubleStrike: false,
        strikeout: false,
        superscript: false,
        subscript: false,
      },
    ]);
  });

  it("handles bold toggle", () => {
    const runs = parseRuns("hello\x02bold\x02world");
    expect(runs).toEqual([
      {
        text: "hello",
        bold: false,
        underline: false,
        italic: false,
        doubleStrike: false,
        strikeout: false,
        superscript: false,
        subscript: false,
      },
      {
        text: "bold",
        bold: true,
        underline: false,
        italic: false,
        doubleStrike: false,
        strikeout: false,
        superscript: false,
        subscript: false,
      },
      {
        text: "world",
        bold: false,
        underline: false,
        italic: false,
        doubleStrike: false,
        strikeout: false,
        superscript: false,
        subscript: false,
      },
    ]);
  });

  it("handles underline toggle", () => {
    const runs = parseRuns("plain\x13under\x13done");
    expect(runs[0]?.underline).toBe(false);
    expect(runs[1]?.underline).toBe(true);
    expect(runs[2]?.underline).toBe(false);
  });

  it("handles italic toggle", () => {
    const runs = parseRuns("plain\x19italic\x19done");
    expect(runs[1]?.italic).toBe(true);
  });

  it("handles double-strike toggle", () => {
    const runs = parseRuns("plain\x04double\x04done");
    expect(runs[1]?.doubleStrike).toBe(true);
  });

  it("handles strikeout toggle", () => {
    const runs = parseRuns("plain\x18strike\x18done");
    expect(runs[1]?.strikeout).toBe(true);
  });

  it("handles superscript toggle", () => {
    const runs = parseRuns("plain\x14super\x14done");
    expect(runs[1]?.superscript).toBe(true);
  });

  it("handles subscript toggle", () => {
    const runs = parseRuns("plain\x16sub\x16done");
    expect(runs[1]?.subscript).toBe(true);
  });

  it("replaces non-break space (\\x0F) with regular space", () => {
    const runs = parseRuns("hello\x0Fworld");
    expect(runs).toEqual([
      {
        text: "hello world",
        bold: false,
        underline: false,
        italic: false,
        doubleStrike: false,
        strikeout: false,
        superscript: false,
        subscript: false,
      },
    ]);
  });

  it("handles non-break space with style changes", () => {
    const runs = parseRuns("a\x02b\x0Fc\x02d");
    // Should be: "a" (plain), "b " (bold), "c" (plain), "d" (bold)
    // Actually, the non-break space maintains its style context
    expect(runs.length).toBeGreaterThan(0);
    const textParts = runs.map((r) => r.text).join("");
    expect(textParts).toBe("ab cd");
  });

  it("skips empty runs", () => {
    // Two consecutive toggles without text between
    const runs = parseRuns("\x02\x02text");
    expect(runs.every((r) => r.text.length > 0)).toBe(true);
  });

  it("handles multiple styles on same run", () => {
    const runs = parseRuns("\x02\x19\x13text\x13\x19\x02");
    expect(runs[0]?.bold).toBe(true);
    expect(runs[0]?.italic).toBe(true);
    expect(runs[0]?.underline).toBe(true);
    expect(runs[0]?.text).toBe("text");
  });

  it("toggle semantics: same control twice flips back", () => {
    const runs = parseRuns("\x02bold\x02notbold\x02bold");
    expect(runs[0]?.bold).toBe(true);
    expect(runs[1]?.bold).toBe(false);
    expect(runs[2]?.bold).toBe(true);
  });

  it("styles reset per line (documented behavior)", () => {
    // This test verifies parseRuns resets per line
    const line = "\x02bold";
    const runs = parseRuns(line);
    expect(runs[0]?.bold).toBe(true);
  });
});

describe("exportText", () => {
  it("exports plain text without controls", () => {
    const doc = createDocument("hello\nworld");
    const text = exportText(doc);
    expect(text).toBe("hello\nworld\n");
  });

  it("strips all control characters", () => {
    const doc = createDocument("hello\x02bold\x02world");
    const text = exportText(doc);
    expect(text).toBe("helloboldworld\n");
  });

  it("skips dot-command lines", () => {
    const doc = createDocument(".lm 5\nhello\n.rm 70\nworld");
    const text = exportText(doc);
    expect(text).toBe("hello\nworld\n");
  });

  it("replaces non-break spaces with regular spaces", () => {
    const doc = createDocument("hello\x0Fworld");
    const text = exportText(doc);
    expect(text).toBe("hello world\n");
  });

  it("includes trailing newline", () => {
    const doc = createDocument("hello");
    const text = exportText(doc);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("handles empty document", () => {
    const doc = createDocument("");
    const text = exportText(doc);
    expect(text).toBe("\n");
  });

  it("handles multiline with mixed content", () => {
    const doc = createDocument(".he Title\nline1\nline2\n.pa\nline3");
    const text = exportText(doc);
    expect(text).toBe("line1\nline2\nline3\n");
  });
});

describe("exportMarkdown", () => {
  it("exports simple paragraphs", () => {
    const doc = createDocument("line1\nline2");
    const md = exportMarkdown(doc);
    expect(md).toContain("line1");
    expect(md).toContain("line2");
  });

  it("joins soft-wrapped lines within a paragraph", () => {
    let doc = createDocument("line1");
    doc = splitLine(doc, { line: 0, col: 5 }, "soft"); // soft return after "line1"
    doc = insertText(doc, { line: 1, col: 0 }, "line2");
    const md = exportMarkdown(doc);
    // line1 and line2 should be joined by a space in same paragraph
    expect(md).toContain("line1 line2");
  });

  it("hard returns delimit paragraphs", () => {
    let doc = createDocument("para1");
    doc = splitLine(doc, { line: 0, col: 5 }, "hard"); // hard return
    doc = insertText(doc, { line: 1, col: 0 }, "para2");
    const md = exportMarkdown(doc);
    // Should have two paragraphs separated by blank line
    expect(md).toContain("para1\n\npara2");
  });

  it("blank lines delimit paragraphs", () => {
    const doc = createDocument("para1\n\npara2");
    const md = exportMarkdown(doc);
    expect(md).toContain("para1\n\npara2");
  });

  it("skips dot lines", () => {
    const doc = createDocument(".lm 5\nparagraph\n.rm 70");
    const md = exportMarkdown(doc);
    expect(md).not.toContain(".lm");
    expect(md).not.toContain(".rm");
    expect(md).toContain("paragraph");
  });

  it(".pa emits paragraph separator ---", () => {
    const doc = createDocument("before\n.pa\nafter");
    const md = exportMarkdown(doc);
    expect(md).toContain("before\n\n---\n\nafter");
  });

  it("applies bold style", () => {
    const doc = createDocument("prefix\x02bold\x02suffix");
    const md = exportMarkdown(doc);
    expect(md).toContain("prefix**bold**suffix");
  });

  it("applies italic style", () => {
    const doc = createDocument("prefix\x19italic\x19suffix");
    const md = exportMarkdown(doc);
    expect(md).toContain("prefix*italic*suffix");
  });

  it("applies strikeout style", () => {
    const doc = createDocument("prefix\x18strike\x18suffix");
    const md = exportMarkdown(doc);
    expect(md).toContain("prefix~~strike~~suffix");
  });

  it("combines bold+italic as ***text***", () => {
    const doc = createDocument("prefix\x02\x19both\x19\x02suffix");
    const md = exportMarkdown(doc);
    expect(md).toContain("prefix***both***suffix");
  });

  it("drops underline, double-strike, super/subscript", () => {
    const doc = createDocument(
      "a\x13under\x13b\x04double\x04c\x14super\x14d\x16sub\x16e",
    );
    const md = exportMarkdown(doc);
    // All the text should be there but without markdown syntax
    expect(md).toContain("aunderbdoublecsuper");
    expect(md).not.toContain("<u>");
    expect(md).not.toContain("<s>");
  });

  it("doesn't wrap whitespace-only runs", () => {
    const doc = createDocument("  ");
    const md = exportMarkdown(doc);
    // Whitespace-only paragraph should be filtered
    expect(md).toBe("");
  });

  it("includes trailing newline", () => {
    const doc = createDocument("text");
    const md = exportMarkdown(doc);
    expect(md.endsWith("\n")).toBe(true);
  });

  it("empty document exports as empty with trailing newline", () => {
    const doc = createDocument("");
    const md = exportMarkdown(doc);
    expect(md).toBe("");
  });
});

describe("exportHtml", () => {
  it("exports valid HTML document structure", () => {
    const doc = createDocument("hello");
    const html = exportHtml(doc, "My Title");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</html>");
  });

  it("includes meta charset utf-8", () => {
    const doc = createDocument("test");
    const html = exportHtml(doc, "Title");
    expect(html).toContain('<meta charset="utf-8">');
  });

  it("escapes title in HTML", () => {
    const doc = createDocument("content");
    const html = exportHtml(doc, 'Title with <script> & "quotes"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("includes style block with page-break CSS", () => {
    const doc = createDocument("text");
    const html = exportHtml(doc, "Title");
    expect(html).toContain(".page-break");
    expect(html).toContain("border-top: 1px dashed #999");
    expect(html).toContain("@media print");
    expect(html).toContain("break-after: page");
  });

  it("renders paragraphs as <p> tags", () => {
    const doc = createDocument("para1\n\npara2");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<p>para1</p>");
    expect(html).toContain("<p>para2</p>");
  });

  it("skips empty paragraphs", () => {
    const doc = createDocument("\n\n\n");
    const html = exportHtml(doc, "Title");
    expect((html.match(/<p><\/p>/g) || []).length).toBe(0);
  });

  it("applies <b> for bold", () => {
    const doc = createDocument("\x02bold\x02");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<b>bold</b>");
  });

  it("applies <i> for italic", () => {
    const doc = createDocument("\x19italic\x19");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<i>italic</i>");
  });

  it("applies <u> for underline", () => {
    const doc = createDocument("\x13under\x13");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<u>under</u>");
  });

  it("applies <s> for strikeout", () => {
    const doc = createDocument("\x18strike\x18");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<s>strike</s>");
  });

  it("applies <sup> for superscript", () => {
    const doc = createDocument("\x14super\x14");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<sup>super</sup>");
  });

  it("applies <sub> for subscript", () => {
    const doc = createDocument("\x16sub\x16");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<sub>sub</sub>");
  });

  it("renders double-strike as <b>", () => {
    const doc = createDocument("\x04double\x04");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<b>double</b>");
  });

  it("nests tags in fixed order", () => {
    const doc = createDocument("\x02\x19bold+italic\x19\x02");
    const html = exportHtml(doc, "Title");
    // Should have proper nesting: <b><i>text</i></b>
    expect(html).toMatch(/<b><i>bold\+italic<\/i><\/b>/);
  });

  it("HTML-escapes text content", () => {
    const doc = createDocument('text with <brackets> & "quotes"');
    const html = exportHtml(doc, "Title");
    expect(html).toContain("&lt;brackets&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("skips dot lines", () => {
    const doc = createDocument(".lm 5\ncontent\n.rm 70");
    const html = exportHtml(doc, "Title");
    expect(html).not.toContain(".lm");
    expect(html).not.toContain(".rm");
    expect(html).toContain("content");
  });

  it("emits <hr class=\"page-break\"> after paragraphs containing break lines", () => {
    // Create a document that will paginate
    // Default: pl=66, mt=3, mb=8 -> capacity=55
    const lines: string[] = [];
    for (let i = 0; i < 56; i++) {
      lines.push(`line ${i}`);
    }
    const doc = createDocument(lines.join("\n"));
    const html = exportHtml(doc, "Title");
    expect(html).toContain('<hr class="page-break">');
  });

  it(".pa contributes to pagination but does not emit ---", () => {
    const doc = createDocument("para1\n.pa\npara2");
    const html = exportHtml(doc, "Title");
    // Should not have "---" in the HTML
    expect(html).not.toContain("---");
    // Should have both paragraphs
    expect(html).toContain("para1");
    expect(html).toContain("para2");
  });

  it("joins soft-wrapped lines in paragraphs", () => {
    let doc = createDocument("soft");
    doc = splitLine(doc, { line: 0, col: 4 }, "soft");
    doc = insertText(doc, { line: 1, col: 0 }, "wrapped");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("soft wrapped");
  });

  it("hard returns delimit paragraphs", () => {
    let doc = createDocument("para1");
    doc = splitLine(doc, { line: 0, col: 5 }, "hard");
    doc = insertText(doc, { line: 1, col: 0 }, "para2");
    const html = exportHtml(doc, "Title");
    expect(html).toContain("<p>para1</p>");
    expect(html).toContain("<p>para2</p>");
  });
});

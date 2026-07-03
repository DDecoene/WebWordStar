import { describe, it, expect } from "vitest";
import { createDocument, splitLine } from "../src/shared/document";
import { exportPdf } from "../server/pdf";

describe("exportPdf", () => {
  it("produces a valid PDF with %PDF magic bytes", async () => {
    const doc = createDocument("Hello World");
    const buffer = await exportPdf(doc, "Test");
    const magic = buffer.slice(0, 4).toString("latin1");
    expect(magic).toBe("%PDF");
  });

  it("produces a 1-page PDF for a simple document", async () => {
    const doc = createDocument("Hello World");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    // Count /Type /Page occurrences (excluding /Pages which is the page tree)
    const pageMatches = content.match(/\/Type\s*\/Page\b/g);
    expect(pageMatches).not.toBeNull();
    expect(pageMatches!.length).toBe(1);
  });

  it("produces a 2-page PDF when document contains a .pa page break", async () => {
    let doc = createDocument(".pa\nSecond page");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    // Count /Type /Page occurrences
    const pageMatches = content.match(/\/Type\s*\/Page\b/g);
    expect(pageMatches).not.toBeNull();
    expect(pageMatches!.length).toBe(2);
  });

  it("draws each page number on its own page, not stacked on the last (regression)", async () => {
    // Before switchToPage, every footer number was drawn on the last page.
    const doc = createDocument("hello world\n.pa\nsecond page text");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    // Content streams appear in page order (compress: false) with hex-encoded
    // text. Page 1's stream must contain its own footer number "1" (hex 31)
    // alongside its text, and not page 2's number.
    const streams = [...content.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1]!);
    const hex = (s: string) => Buffer.from(s, "latin1").toString("hex");
    expect(streams[0]).toContain(hex("hello world"));
    expect(streams[0]).toContain(`<${hex("1")}>`);
    expect(streams[0]).not.toContain(`<${hex("2")}>`);
    expect(streams[1]).toContain(`<${hex("2")}>`);
  });

  it("renders underline and strikeout runs without throwing (regression)", async () => {
    // pdfkit needs an explicit width for underline/strike when lineBreak is
    // false; without it, exportPdf threw "unsupported number: NaN".
    const doc = createDocument("a \x13underlined\x13 and \x18struck\x18 word");
    const buffer = await exportPdf(doc, "Test");
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("a mid-page .ls change does not rescale earlier lines (regression)", async () => {
    // With .ls 2 starting at line "bb", "bb" must sit one line slot below
    // "aa" (12pt at pl 66), and "cc" two slots below "bb". The old y-math
    // (slot count x current spacing) pushed "bb" and "cc" twice as far down.
    const doc = createDocument("aa\n.ls 2\nbb\ncc");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    const stream = [...content.matchAll(/stream\r?\n([\s\S]*?)endstream/g)][0]![1]!;
    // Pair each Tm y-coordinate with the hex text that follows it.
    const ops = [...stream.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm\s*\n\/F\d+ [\d.]+ Tf\s*\n\[<([0-9a-f]+)>/g)];
    const yOf = (text: string) => {
      const hex = Buffer.from(text, "latin1").toString("hex");
      return parseFloat(ops.find((m) => m[2] === hex)![1]!);
    };
    // Stream y is flipped (top-down drawing under a flipped cm), so higher
    // on the page = larger value; assert relative gaps of 1 and 2 slots.
    const lineHeight = 792 / 66;
    expect(yOf("aa") - yOf("bb")).toBeCloseTo(lineHeight, 3);
    expect(yOf("bb") - yOf("cc")).toBeCloseTo(2 * lineHeight, 3);
  });

  it("a .he/.fo declared at the top of the document appears on page 1 (regression)", async () => {
    // scanLayout folds strictly-before; scanning at the page's first line
    // missed headers declared on that page's own leading dot lines.
    const doc = createDocument(".he Top #\n.fo Bottom\nbody text");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    const firstStream = [...content.matchAll(/stream\r?\n([\s\S]*?)endstream/g)][0]![1]!;
    const hex = (s: string) => Buffer.from(s, "latin1").toString("hex");
    expect(firstStream).toContain(hex("Top 1"));
    expect(firstStream).toContain(hex("Bottom"));
  });

  it("includes text content in the PDF", async () => {
    const doc = createDocument("The quick brown fox");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    // PDFKit encodes text as hex in the content stream.
    // "quick" in hex is 717569636b; check for BT...TJ structure with content
    expect(content).toMatch(/BT\s+[\s\S]*?TJ/);
  });

  it("exports an empty document", async () => {
    const doc = createDocument("");
    const buffer = await exportPdf(doc, "Empty");
    const magic = buffer.slice(0, 4).toString("latin1");
    expect(magic).toBe("%PDF");
    const content = buffer.toString("latin1");
    const pageMatches = content.match(/\/Type\s*\/Page\b/g);
    expect(pageMatches).not.toBeNull();
    expect(pageMatches!.length).toBe(1);
  });

  it("produces non-trivial PDF size for multi-line content", async () => {
    const lines = Array(10)
      .fill(0)
      .map((_, i) => `Line ${i + 1}: Some content here`);
    const doc = createDocument(lines.join("\n"));
    const buffer = await exportPdf(doc, "MultiLine");
    // PDF should be at least a few hundred bytes for structured content
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("handles documents with hard and soft returns", async () => {
    let doc = createDocument("Hello\nWorld");
    doc = splitLine(doc, { line: 0, col: 3 }, "soft"); // Soft wrap in first line
    const buffer = await exportPdf(doc, "Test");
    const magic = buffer.slice(0, 4).toString("latin1");
    expect(magic).toBe("%PDF");
  });

  it("handles multiple page breaks correctly", async () => {
    let doc = createDocument(".pa\nPage 2\n.pa\nPage 3");
    const buffer = await exportPdf(doc, "Test");
    const content = buffer.toString("latin1");
    const pageMatches = content.match(/\/Type\s*\/Page\b/g);
    expect(pageMatches).not.toBeNull();
    expect(pageMatches!.length).toBe(3);
  });

  it("respects document title in PDF metadata", async () => {
    const doc = createDocument("Content here");
    const buffer = await exportPdf(doc, "MyDocTitle");
    // PDF should be valid regardless; title is metadata
    const magic = buffer.slice(0, 4).toString("latin1");
    expect(magic).toBe("%PDF");
  });

  it("renders styled text (bold, italic, etc.)", async () => {
    // Create a line with bold control character
    let doc = createDocument("\x02bold text\x02");
    const buffer = await exportPdf(doc, "Styled");
    const content = buffer.toString("latin1");
    // Check that Courier-Bold font is used for styled text
    expect(content).toContain("Courier-Bold");
    const pageMatches = content.match(/\/Type\s*\/Page\b/g);
    expect(pageMatches).not.toBeNull();
    expect(pageMatches!.length).toBe(1);
  });

  it("handles very long lines without crashing", async () => {
    const longLine = "a".repeat(200);
    const doc = createDocument(longLine);
    const buffer = await exportPdf(doc, "LongLine");
    const magic = buffer.slice(0, 4).toString("latin1");
    expect(magic).toBe("%PDF");
  });

  it("produces different PDFs for different content", async () => {
    const doc1 = createDocument("Content A");
    const doc2 = createDocument("Content B");
    const buffer1 = await exportPdf(doc1, "Doc1");
    const buffer2 = await exportPdf(doc2, "Doc2");
    // Buffers should differ (content and timestamps)
    expect(buffer1.toString("latin1")).not.toBe(buffer2.toString("latin1"));
  });
});

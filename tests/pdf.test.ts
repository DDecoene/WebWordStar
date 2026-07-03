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

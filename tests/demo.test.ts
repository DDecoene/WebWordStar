import { describe, it, expect } from "vitest";
import { DEMO_DOCUMENT } from "../src/shared/demo";
import { createDocument } from "../src/shared/document";
import { exportText, exportMarkdown, exportHtml } from "../src/shared/export";
import { exportPdf } from "../server/pdf";
import { paginate } from "../src/shared/page";

describe("DEMO_DOCUMENT", () => {
  it("exports as plain text without throwing", () => {
    const doc = createDocument(DEMO_DOCUMENT);
    expect(() => exportText(doc)).not.toThrow();
  });

  it("exports as Markdown without throwing", () => {
    const doc = createDocument(DEMO_DOCUMENT);
    expect(() => exportMarkdown(doc)).not.toThrow();
  });

  it("exports as HTML without throwing", () => {
    const doc = createDocument(DEMO_DOCUMENT);
    expect(() => exportHtml(doc, "DEMO DOCUMENT")).not.toThrow();
  });

  it("exports as PDF without throwing", async () => {
    const doc = createDocument(DEMO_DOCUMENT);
    const buffer = await exportPdf(doc, "DEMO DOCUMENT");
    expect(buffer.toString("ascii", 0, 4)).toBe("%PDF");
  });

  it("paginates to at least two pages", () => {
    const doc = createDocument(DEMO_DOCUMENT);
    const pagination = paginate(doc, { left: 0, right: 65, spacing: 1 });
    expect(pagination.pageNumbers.length).toBeGreaterThanOrEqual(2);
  });

  it("contains every ^P print control character", () => {
    expect(DEMO_DOCUMENT).toContain("\x02"); // bold
    expect(DEMO_DOCUMENT).toContain("\x13"); // underline
    expect(DEMO_DOCUMENT).toContain("\x19"); // italic
    expect(DEMO_DOCUMENT).toContain("\x04"); // double-strike
    expect(DEMO_DOCUMENT).toContain("\x18"); // strikeout
    expect(DEMO_DOCUMENT).toContain("\x14"); // superscript
    expect(DEMO_DOCUMENT).toContain("\x16"); // subscript
  });

  it("contains the expected dot commands", () => {
    expect(DEMO_DOCUMENT).toContain(".he ");
    expect(DEMO_DOCUMENT).toContain(".fo ");
    expect(DEMO_DOCUMENT).toContain(".lm ");
    expect(DEMO_DOCUMENT).toContain(".rm ");
    expect(DEMO_DOCUMENT).toContain(".ls ");
    expect(DEMO_DOCUMENT).toContain(".pa");
    expect(DEMO_DOCUMENT).toContain(".cp ");
  });

  it("contains a ^OC-centered title line", () => {
    const lines = DEMO_DOCUMENT.split("\n");
    const titleLine = lines.find((l) => l.includes("WELCOME TO WEBWORDSTAR"));
    expect(titleLine).toBeDefined();
    const leading = titleLine!.length - titleLine!.trimStart().length;
    const trimmed = titleLine!.trim();
    const expectedCol = Math.floor((66 - trimmed.length) / 2);
    expect(leading).toBe(expectedCol);
  });

  it("keeps all lines at or under 65 characters", () => {
    const lines = DEMO_DOCUMENT.split("\n");
    for (const line of lines) {
      // Strip control characters before measuring visible width.
      const visible = line.replace(/[\x00-\x1f]/g, "");
      expect(visible.length).toBeLessThanOrEqual(65);
    }
  });
});

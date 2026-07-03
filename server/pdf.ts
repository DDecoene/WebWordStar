import type { TextDocument } from "../src/shared/types";
import type { BaseSettings } from "../src/shared/dot";
import { scanLayout, isDotLine } from "../src/shared/dot";
import { paginate } from "../src/shared/page";
import { parseRuns } from "../src/shared/export";
import PDFDocument from "pdfkit";

/**
 * Export a document to PDF format.
 *
 * Page geometry driven by layout: line height = pageHeight / pl.
 * Text area top/bottom from mt/mb line counts, left/right from lm/rm column positions.
 * Courier family fonts with monospace advance width of 7.2pt (fontSize 12, advance = 0.6 * fontSize).
 * Lines are already positioned with leading spaces included; x starts at column 1 with no lm offset.
 * Returns a Promise<Buffer> containing the complete PDF.
 *
 * @param doc - The document to export
 * @param title - Document title (reserved for future metadata use)
 */
export async function exportPdf(doc: TextDocument, _title: string): Promise<Buffer> {
  // Letter size: 612x792pt, margins 0 (we compute our own geometry)
  const pageHeight = 792;
  // const pageWidth = 612; // Standard letter width, reserved for future layout use

  // Font constants
  const fontSize = 12;
  const charWidth = 7.2; // fontSize * 0.6 for Courier
  const supersubFontSize = fontSize * 0.7;
  const supersubOffset = fontSize * 0.3;

  // Base settings
  const base: BaseSettings = { left: 0, right: 70, spacing: 1 };

  // Compute pagination
  const pagination = paginate(doc, base);
  const { breaks, pageOfLine, pageNumbers, omit } = pagination;
  const pageCount = pageNumbers.length;

  // Create PDF document with compress disabled for test readability.
  // bufferPages keeps every page addressable so headers/footers can be drawn
  // per page (switchToPage) after the content pass.
  const pdf = new PDFDocument({
    size: "Letter",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    compress: false,
    bufferPages: true,
  });

  // Collect PDF data into a buffer
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    pdf.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    pdf.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    pdf.on("error", (err: Error) => {
      reject(err);
    });

    // Track current page and per-line layout
    let currentPage = 0;
    let lineInPage = 0;
    let currentPl = base.pageLen ?? 66;
    let currentMt = base.marginTop ?? 3;
    let currentLs = base.spacing ?? 1;

    const lineHeight = pageHeight / currentPl;

    // Compute y position for a line in the current page.
    // mt lines = margin top, first text line baseline at y = mt * lineHeight.
    // Line i (0-based line in page) has baseline at y = mt * lineHeight + i * currentLs * lineHeight.
    const getLineY = (lineInPageArg: number): number => {
      return currentMt * lineHeight + lineInPageArg * currentLs * lineHeight;
    };

    // Start the first page
    pdf.fontSize(fontSize).font("Courier");

    // Render each document line
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i]!;
      const pageIdx = pageOfLine[i];

      // Check if we need a new page
      if (pageIdx > currentPage) {
        currentPage = pageIdx;
        lineInPage = 0;
        // Scan layout at this page's first line to get the effective settings
        const layoutAtPage = scanLayout(doc, i, base);
        currentPl = layoutAtPage.pageLen;
        currentMt = layoutAtPage.marginTop;
        // Start a new page
        pdf.addPage();
      }

      // Skip dot lines
      if (isDotLine(line)) {
        continue;
      }

      // Compute layout at this line
      const layout = scanLayout(doc, i, base);
      currentLs = layout.spacing;

      // Compute y position
      const y = getLineY(lineInPage);

      // Render the line
      renderLine(pdf, line, 0, y, fontSize, charWidth, supersubFontSize, supersubOffset);

      lineInPage++;
    }

    // Render headers and footers onto their own pages via switchToPage —
    // without it every header/footer lands stacked on the last page, and
    // text near the bottom edge makes pdfkit auto-add a phantom page.
    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      pdf.switchToPage(pageIdx);

      // Get layout at this page's first line
      const pageFirstLine = pageIdx === 0 ? 0 : breaks[pageIdx - 1]! + 1;
      const layoutAtPage = scanLayout(doc, pageFirstLine, base);
      const pl = layoutAtPage.pageLen;
      const mt = layoutAtPage.marginTop;
      const mb = layoutAtPage.marginBottom;

      const pageNum = pageNumbers[pageIdx]!;
      const omitNum = omit[pageIdx]!;

      // Render header if present
      if (layoutAtPage.header.length > 0) {
        const headerText = layoutAtPage.header.replace(/#/g, pageNum.toString());
        const headerY = (mt - 2) * lineHeight;
        pdf
          .fontSize(fontSize)
          .font("Courier")
          .text(headerText, 0, headerY, { lineBreak: false });
      }

      // Render footer if present, or page number
      const footerY = (pl - mb + 2) * lineHeight;
      if (layoutAtPage.footer.length > 0) {
        const footerText = layoutAtPage.footer.replace(/#/g, pageNum.toString());
        pdf
          .fontSize(fontSize)
          .font("Courier")
          .text(footerText, 0, footerY, { lineBreak: false });
      } else if (!omitNum) {
        // Center page number
        const pageNumStr = pageNum.toString();
        pdf
          .fontSize(fontSize)
          .font("Courier")
          .text(pageNumStr, 0, footerY, { width: 612, align: "center", lineBreak: false });
      }
    }

    pdf.flushPages();
    pdf.end();
  });
}

/**
 * Render a single line with styled runs.
 * x is the starting column (0-based, but lines already contain leading spaces).
 * y is the baseline y-coordinate.
 */
function renderLine(
  pdf: typeof PDFDocument.prototype,
  line: string,
  x: number,
  y: number,
  fontSize: number,
  charWidth: number,
  supersubFontSize: number,
  supersubOffset: number,
): void {
  const runs = parseRuns(line);

  let currentX = x;
  for (const run of runs) {
    // Determine font based on style
    let fontName: string;
    if (run.bold && run.italic) {
      fontName = "Courier-BoldOblique";
    } else if (run.bold || run.doubleStrike) {
      fontName = "Courier-Bold";
    } else if (run.italic) {
      fontName = "Courier-Oblique";
    } else {
      fontName = "Courier";
    }

    // Determine font size and baseline shift for super/subscript
    let runFontSize = fontSize;
    let baselineShift = 0;
    if (run.superscript) {
      runFontSize = supersubFontSize;
      baselineShift = supersubOffset;
    } else if (run.subscript) {
      runFontSize = supersubFontSize;
      baselineShift = -supersubOffset;
    }

    // Build text options
    const textOptions: any = {
      lineBreak: false,
      continued: false,
    };
    if (run.underline) textOptions.underline = true;
    if (run.strikeout) textOptions.strike = true;

    // Render the run
    pdf.fontSize(runFontSize).font(fontName);
    pdf.text(run.text, currentX, y - baselineShift, textOptions);

    // Advance x by run width (counting displayable characters, not control chars)
    // For super/subscript, use the smaller font size for advance calculation
    const advanceFontSize = (runFontSize === supersubFontSize ? supersubFontSize : fontSize);
    const advanceWidth = run.text.length * (advanceFontSize / fontSize) * charWidth;
    currentX += advanceWidth;
  }
}

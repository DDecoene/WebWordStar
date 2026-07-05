// This file is part of WebWordStar, an independent reimplementation of the
// WordStar keyboard interface. Copyright (C) 2026 Dennis Decoene.
// SPDX-License-Identifier: AGPL-3.0-only (see LICENSE)

import type { TextDocument } from "./types";
import { isDotLine, parseDotLine, scanLayout, type BaseSettings } from "./dot";
import { paginate } from "./page";

/** Editor ruler defaults (see createRuler in editor/state.ts). */
const EXPORT_BASE: BaseSettings = { left: 0, right: 65, spacing: 1 };

/**
 * True when the line's leading spaces put its text exactly where ^O C would:
 * left + floor((width - len) / 2) under the margins in effect at that line.
 */
function isCenteredLine(doc: TextDocument, lineIdx: number, line: string): boolean {
  const leading = line.length - line.trimStart().length;
  if (leading === 0) return false;
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  const layout = scanLayout(doc, lineIdx, EXPORT_BASE);
  const width = layout.right - layout.left + 1;
  const col = Math.max(layout.left, layout.left + Math.floor((width - trimmed.length) / 2));
  return leading === col && col > layout.left;
}

export interface Run {
  text: string;
  bold: boolean;
  underline: boolean;
  italic: boolean;
  doubleStrike: boolean;
  strikeout: boolean;
  superscript: boolean;
  subscript: boolean;
}

/**
 * Parse a line into styled runs, handling WordStar print-control characters.
 *
 * WordStar uses toggle semantics: each occurrence of a control character flips
 * that style on/off. \x0F (non-break space) is replaced with a regular space.
 * All control characters are removed from output. Styles reset at the start of
 * each line. New runs are emitted when style state changes; empty runs are skipped.
 *
 * Control character codes:
 * - \x02: bold
 * - \x13: underline
 * - \x19: italic
 * - \x04: double-strike
 * - \x18: strikeout
 * - \x14: superscript
 * - \x16: subscript
 * - \x0F: non-break space
 */
export function parseRuns(line: string): Run[] {
  const runs: Run[] = [];

  let currentStyle: Omit<Run, "text"> = {
    bold: false,
    underline: false,
    italic: false,
    doubleStrike: false,
    strikeout: false,
    superscript: false,
    subscript: false,
  };

  let currentText = "";
  let previousStyle = { ...currentStyle };

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    const code = char.charCodeAt(0);

    // Handle control characters
    if (code === 0x02) {
      // bold toggle
      currentStyle.bold = !currentStyle.bold;
    } else if (code === 0x13) {
      // underline toggle
      currentStyle.underline = !currentStyle.underline;
    } else if (code === 0x19) {
      // italic toggle
      currentStyle.italic = !currentStyle.italic;
    } else if (code === 0x04) {
      // double-strike toggle
      currentStyle.doubleStrike = !currentStyle.doubleStrike;
    } else if (code === 0x18) {
      // strikeout toggle
      currentStyle.strikeout = !currentStyle.strikeout;
    } else if (code === 0x14) {
      // superscript toggle
      currentStyle.superscript = !currentStyle.superscript;
    } else if (code === 0x16) {
      // subscript toggle
      currentStyle.subscript = !currentStyle.subscript;
    } else if (code === 0x0f) {
      // non-break space: replace with regular space
      if (JSON.stringify(currentStyle) !== JSON.stringify(previousStyle)) {
        if (currentText.length > 0) {
          runs.push({ text: currentText, ...previousStyle });
          currentText = "";
        }
        previousStyle = { ...currentStyle };
      }
      currentText += " ";
    } else {
      // Regular character
      if (JSON.stringify(currentStyle) !== JSON.stringify(previousStyle)) {
        if (currentText.length > 0) {
          runs.push({ text: currentText, ...previousStyle });
          currentText = "";
        }
        previousStyle = { ...currentStyle };
      }
      currentText += char;
    }
  }

  // Push any remaining text
  if (currentText.length > 0) {
    runs.push({ text: currentText, ...previousStyle });
  }

  return runs;
}

/**
 * Export the document as plain UTF-8 text.
 *
 * Skips dot-command lines. Strips all print-control characters.
 * Lines are emitted at their existing (wrapped) line breaks.
 * Trailing newline is included.
 */
export function exportText(doc: TextDocument): string {
  const lines = doc.lines
    .filter((line) => !isDotLine(line))
    .map((line) => {
      const runs = parseRuns(line);
      return runs.map((run) => run.text).join("");
    });

  return lines.join("\n") + "\n";
}

/**
 * Export the document as Markdown.
 *
 * Dot lines are skipped, except `.pa` which emits a paragraph separator `---`.
 * Soft-wrapped lines of a paragraph are joined into a single line per paragraph.
 * Hard returns and blank lines delimit paragraphs.
 * Styles: **bold**, *italic*, ~~strikeout~~; underline, double-strike, super/subscript dropped.
 * Combined bold+italic renders as ***text***.
 * Paragraphs are separated by a blank line. Trailing newline is included.
 */
export function exportMarkdown(doc: TextDocument): string {
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i]!;

    if (isDotLine(line)) {
      // Check if it's a .pa command
      const cmd = parseDotLine(line);
      if (cmd && cmd.kind === "pa") {
        // Flush current paragraph if any
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(" "));
          currentParagraph = [];
        }
        // Add page break separator
        paragraphs.push("---");
      }
      // Skip other dot lines
      continue;
    }

    // Handle regular content lines
    if (line.trim() === "") {
      // Blank line ends paragraph
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
    } else {
      // Render the line with styles. Leading indent (e.g. ^OC centering) is
      // trimmed: 4+ leading spaces would otherwise read as a Markdown code block.
      const runs = parseRuns(line.trim());
      const styledLine = renderMarkdownRuns(runs);
      currentParagraph.push(styledLine);

      // Check if this line ends with a hard return (paragraph break)
      if (doc.returns[i] === "hard") {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(" "));
          currentParagraph = [];
        }
      }
    }
  }

  // Flush any remaining paragraph
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  // Filter out empty paragraphs and join with blank lines
  const filtered = paragraphs.filter((p) => p.length > 0);
  return filtered.join("\n\n") + (filtered.length > 0 ? "\n" : "");
}

/**
 * Render a set of runs as Markdown, applying inline styles.
 * Styles: **bold**, *italic*, ~~strikeout~~; others dropped.
 * bold+italic -> ***text***
 */
function renderMarkdownRuns(runs: Run[]): string {
  return runs
    .map((run) => {
      let text = run.text;

      // Don't wrap whitespace-only runs
      if (text.trim().length === 0) return text;

      // Apply styles: bold+italic first, then individual styles
      if (run.bold && run.italic) {
        text = `***${text}***`;
      } else if (run.bold) {
        text = `**${text}**`;
      } else if (run.italic) {
        text = `*${text}*`;
      }

      if (run.strikeout) {
        text = `~~${text}~~`;
      }

      return text;
    })
    .join("");
}

/**
 * Export the document as standalone HTML.
 *
 * Includes DOCTYPE, charset, title (HTML-escaped), and a style block.
 * Same paragraph grouping as Markdown (soft-return joins, hard return/blank line ends).
 * Each paragraph is a <p>...</p>. Empty paragraphs skipped.
 * Styles: <b>, <i>, <u>, <s>, <sup>, <sub>; doubleStrike renders as <b>.
 * Tags nested in a fixed order. All text is HTML-escaped (& < > ").
 * Page breaks from paginate() emit <hr class="page-break"> at the page turn.
 * Single lines centered with ^O C render as <p class="centered">.
 */
export function exportHtml(doc: TextDocument, title: string): string {
  // Escape title for HTML
  const escapedTitle = htmlEscape(title);

  // Compute page breaks (indices of the LAST line of each page but the final one)
  const pagination = paginate(doc, EXPORT_BASE);

  // Build paragraphs. Dot lines emit no content and never join a paragraph;
  // they only drive pagination.
  const paragraphs: Array<{ html: string; centered: boolean; minIdx: number; maxIdx: number }> = [];
  let currentParagraph: Array<{ text: string; lineIdx: number; centered: boolean }> = [];

  const flush = () => {
    if (currentParagraph.length === 0) return;
    const html = renderHtmlParagraph(currentParagraph.map((p) => p.text));
    if (html.trim().length > 0) {
      paragraphs.push({
        html,
        // A paragraph renders centered when it is a single ^OC-centered line.
        centered: currentParagraph.length === 1 && currentParagraph[0]!.centered,
        minIdx: currentParagraph[0]!.lineIdx,
        maxIdx: currentParagraph[currentParagraph.length - 1]!.lineIdx,
      });
    }
    currentParagraph = [];
  };

  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i]!;

    if (isDotLine(line) || line.trim() === "") {
      // Dot line or blank line: ends the current paragraph, emits nothing.
      flush();
      continue;
    }

    // Regular content line. Leading indent (e.g. ^OC centering) is trimmed:
    // HTML collapses it anyway; centered lines get text-align instead.
    const centered = isCenteredLine(doc, i, line);
    const runs = parseRuns(line.trim());
    currentParagraph.push({ text: renderHtmlRuns(runs), lineIdx: i, centered });

    // A hard return ends the paragraph.
    if (doc.returns[i] === "hard") flush();
  }
  flush();

  // Build body: an <hr class="page-break"> goes where the page turns — before a
  // paragraph that starts past a break, or after one that contains the break.
  const bodyParts: string[] = [];
  const breaks = [...pagination.breaks].sort((a, b) => a - b);
  let nextBreak = 0;

  for (const { html, centered, minIdx, maxIdx } of paragraphs) {
    while (nextBreak < breaks.length && breaks[nextBreak]! < minIdx) {
      bodyParts.push('<hr class="page-break">');
      nextBreak++;
    }
    bodyParts.push(centered ? `<p class="centered">${html}</p>` : `<p>${html}</p>`);
    while (nextBreak < breaks.length && breaks[nextBreak]! <= maxIdx) {
      bodyParts.push('<hr class="page-break">');
      nextBreak++;
    }
  }

  const body = bodyParts.join("\n");

  const css = `
    .page-break {
      border: none;
      border-top: 1px dashed #999;
    }
    .centered {
      text-align: center;
    }
    @media print {
      .page-break {
        break-after: page;
        visibility: hidden;
      }
    }
    body {
      max-width: 70ch;
      margin: 2rem auto;
      font-family: serif;
      line-height: 1.5;
    }
  `.trim();

  return (
    `<!doctype html>\n` +
    `<html>\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<title>${escapedTitle}</title>\n` +
    `<style>\n${css}\n</style>\n` +
    `</head>\n` +
    `<body>\n${body}\n</body>\n` +
    `</html>`
  );
}

/**
 * HTML-escape special characters: & < > "
 */
function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a paragraph (array of styled line HTML) as a single paragraph.
 * Lines are joined with a space.
 */
function renderHtmlParagraph(lines: string[]): string {
  return lines.join(" ");
}

/**
 * Render a set of runs as HTML, applying semantic tags in a fixed nesting order.
 * Tag nesting order (outermost to innermost): b, i, u, s, sup, sub
 * We apply tags innermost first so that when nested, b ends up outermost.
 * doubleStrike renders as <b>
 * All text is HTML-escaped.
 */
function renderHtmlRuns(runs: Run[]): string {
  return runs
    .map((run) => {
      let text = htmlEscape(run.text);

      // Apply tags innermost first, so outermost tags wrap last
      // Nesting order: sub, sup, s, u, i, b (innermost to outermost)
      if (run.subscript) {
        text = `<sub>${text}</sub>`;
      }
      if (run.superscript) {
        text = `<sup>${text}</sup>`;
      }
      if (run.strikeout) {
        text = `<s>${text}</s>`;
      }
      if (run.underline) {
        text = `<u>${text}</u>`;
      }
      if (run.italic) {
        text = `<i>${text}</i>`;
      }
      if (run.bold || run.doubleStrike) {
        text = `<b>${text}</b>`;
      }

      return text;
    })
    .join("");
}

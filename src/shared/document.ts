import type { TextDocument, Position, EditIntent } from "./types";

/** Create a document. Empty text yields a single empty line. */
export function createDocument(text = ""): TextDocument {
  return { lines: text.split("\n") };
}

/** Serialize the document back to a single string with newline separators. */
export function getText(doc: TextDocument): string {
  return doc.lines.join("\n");
}

/**
 * Delete everything from `start` (inclusive) to `end` (exclusive), where
 * start <= end in document order. Returns a new document; the line containing
 * `start` is joined with the remainder of the line containing `end`.
 */
export function deleteRange(doc: TextDocument, start: Position, end: Position): TextDocument {
  const lines = doc.lines.slice();
  const head = (lines[start.line] ?? "").slice(0, start.col);
  const tail = (lines[end.line] ?? "").slice(end.col);
  lines.splice(start.line, end.line - start.line + 1, head + tail);
  return { lines };
}

/** Insert text into a single line at the given position. Returns a new document. */
export function insertText(doc: TextDocument, at: Position, text: string): TextDocument {
  const lines = doc.lines.slice();
  const line = lines[at.line] ?? "";
  lines[at.line] = line.slice(0, at.col) + text + line.slice(at.col);
  return { lines };
}

/** Split a line at the position into two lines. Returns a new document. */
export function splitLine(doc: TextDocument, at: Position): TextDocument {
  const lines = doc.lines.slice();
  const line = lines[at.line] ?? "";
  lines.splice(at.line, 1, line.slice(0, at.col), line.slice(at.col));
  return { lines };
}

/** Apply any edit intent to the document, returning a new document. */
export function applyIntent(doc: TextDocument, intent: EditIntent): TextDocument {
  switch (intent.kind) {
    case "insertText":
      return insertText(doc, intent.at, intent.text);
    case "deleteRange":
      return deleteRange(doc, intent.start, intent.end);
    case "splitLine":
      return splitLine(doc, intent.at);
  }
}

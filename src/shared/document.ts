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
 *
 * @throws {RangeError} if `start.line` or `end.line` is out of range.
 */
export function deleteRange(doc: TextDocument, start: Position, end: Position): TextDocument {
  if (start.line < 0 || start.line >= doc.lines.length) {
    throw new RangeError("deleteRange: line index out of range");
  }
  if (end.line < 0 || end.line >= doc.lines.length) {
    throw new RangeError("deleteRange: line index out of range");
  }
  const lines = doc.lines.slice();
  const head = lines[start.line].slice(0, start.col);
  const tail = lines[end.line].slice(end.col);
  lines.splice(start.line, end.line - start.line + 1, head + tail);
  return { lines };
}

/**
 * Insert text into a single line at the given position. Returns a new document.
 *
 * @precondition `text` must not contain newlines; use `splitLine` for line breaks.
 * @throws {RangeError} if `text` contains a newline character.
 * @throws {RangeError} if `at.line` is out of range.
 */
export function insertText(doc: TextDocument, at: Position, text: string): TextDocument {
  if (text.includes("\n")) {
    throw new RangeError("insertText: text must not contain newlines; use splitLine");
  }
  if (at.line < 0 || at.line >= doc.lines.length) {
    throw new RangeError("insertText: line index out of range");
  }
  const lines = doc.lines.slice();
  const line = lines[at.line];
  lines[at.line] = line.slice(0, at.col) + text + line.slice(at.col);
  return { lines };
}

/**
 * Split a line at the position into two lines. Returns a new document.
 *
 * @throws {RangeError} if `at.line` is out of range.
 */
export function splitLine(doc: TextDocument, at: Position): TextDocument {
  if (at.line < 0 || at.line >= doc.lines.length) {
    throw new RangeError("splitLine: line index out of range");
  }
  const lines = doc.lines.slice();
  const line = lines[at.line];
  lines.splice(at.line, 1, line.slice(0, at.col), line.slice(at.col));
  return { lines };
}

/** Return the text between start (inclusive) and end (exclusive), in document order, joined by "\n". */
export function getRange(doc: TextDocument, start: Position, end: Position): string {
  if (start.line === end.line) {
    return (doc.lines[start.line] ?? "").slice(start.col, end.col);
  }
  const first = (doc.lines[start.line] ?? "").slice(start.col);
  const middle = doc.lines.slice(start.line + 1, end.line);
  const last = (doc.lines[end.line] ?? "").slice(0, end.col);
  return [first, ...middle, last].join("\n");
}

/**
 * Insert text (which may contain newlines) at `at`. Returns the new document and
 * the end position just past the inserted text.
 */
export function insertMultiline(
  doc: TextDocument,
  at: Position,
  text: string,
): { document: TextDocument; end: Position } {
  const parts = text.split("\n");
  const lines = doc.lines.slice();
  const target = lines[at.line] ?? "";
  const head = target.slice(0, at.col);
  const tail = target.slice(at.col);

  if (parts.length === 1) {
    lines[at.line] = head + parts[0] + tail;
    return { document: { lines }, end: { line: at.line, col: at.col + parts[0]!.length } };
  }

  const firstLine = head + parts[0];
  const lastPart = parts[parts.length - 1]!;
  const lastLine = lastPart + tail;
  const middle = parts.slice(1, -1);
  lines.splice(at.line, 1, firstLine, ...middle, lastLine);
  return {
    document: { lines },
    end: { line: at.line + parts.length - 1, col: lastPart.length },
  };
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

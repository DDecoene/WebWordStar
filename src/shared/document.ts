import type { TextDocument, Position, EditIntent } from "./types";

/** Create a document. Empty text yields a single empty line. */
export function createDocument(text = ""): TextDocument {
  return { lines: text.split("\n") };
}

/** Serialize the document back to a single string with newline separators. */
export function getText(doc: TextDocument): string {
  return doc.lines.join("\n");
}

/** Insert text into a single line at the given position. Returns a new document. */
export function insertText(doc: TextDocument, at: Position, text: string): TextDocument {
  const lines = doc.lines.slice();
  const line = lines[at.line] ?? "";
  lines[at.line] = line.slice(0, at.col) + text + line.slice(at.col);
  return { lines };
}

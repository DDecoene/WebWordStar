import type { TextDocument, Position, EditIntent } from "./types";

/** Create a document. Empty text yields a single empty line. */
export function createDocument(text = ""): TextDocument {
  return { lines: text.split("\n") };
}

/** Serialize the document back to a single string with newline separators. */
export function getText(doc: TextDocument): string {
  return doc.lines.join("\n");
}

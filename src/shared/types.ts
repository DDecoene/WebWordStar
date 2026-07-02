/** A zero-based cursor position: line index and column (character) index. */
export interface Position {
  line: number;
  col: number;
}

/**
 * The document model: text as an array of lines (no trailing newline characters;
 * the array boundaries ARE the line breaks). This is the single source of truth.
 * Formatting runs and dot commands are added in later stages.
 */
export interface TextDocument {
  lines: string[];
  /** returns[i] describes the break after lines[i]; the last entry is always "hard". */
  returns: ("hard" | "soft")[];
}

/** Edit intents: what a client asks the server to do. Pure data. */
export type EditIntent =
  | { kind: "insertText"; at: Position; text: string }
  | { kind: "deleteRange"; start: Position; end: Position }
  | { kind: "splitLine"; at: Position };

/** An applied, ordered mutation broadcast by the server authority. */
export interface AppliedOp {
  docId: string;
  revision: number;
  intent: EditIntent;
}

/** Presence of a peer editing the same document. */
export interface Presence {
  docId: string;
  userId: string;
  name: string;
  cursor: Position;
}

/** Full document snapshot sent to a client on join. */
export interface Snapshot {
  docId: string;
  revision: number;
  document: TextDocument;
}

/** Messages the browser sends to the server. */
export type ClientMessage =
  | { type: "join"; docId: string }
  | { type: "save"; docId: string; content: string }
  | { type: "setTitle"; docId: string; title: string };

/** Messages the server sends to the browser. */
export type ServerMessage =
  | { type: "snapshot"; docId: string; content: string; title: string };

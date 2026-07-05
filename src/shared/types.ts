// This file is part of WebWordStar, an independent reimplementation of the
// WordStar keyboard interface. Copyright (C) 2026 Dennis Decoene.
// SPDX-License-Identifier: AGPL-3.0-only (see LICENSE)

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
  | { kind: "insertText"; at: Position; text: string } // text may contain \n (hard returns)
  | { kind: "deleteRange"; start: Position; end: Position }
  | { kind: "splitLine"; at: Position; break?: "hard" | "soft" } // default hard
  | { kind: "setReturn"; line: number; return: "hard" | "soft" };

/** A peer editing the same document (presence). */
export interface Peer {
  id: string;
  name: string;
  color: string;
  cursor: Position | null;
}

/** Messages the browser sends to the server. */
export type ClientMessage =
  | { type: "join"; docId: string }
  | { type: "intent"; docId: string; baseRevision: number; clientSeq: number; intents: EditIntent[] }
  | { type: "cursor"; docId: string; cursor: Position }
  | { type: "setTitle"; docId: string; title: string }
  | { type: "resync"; docId: string };

/** Full authoritative snapshot sent on join and on resync. */
export interface SnapshotMessage {
  type: "snapshot";
  docId: string;
  revision: number;
  content: string;
  title: string;
  selfId: string;
  selfName: string;
  selfColor: string;
  peers: Peer[];
}

/** An applied, ordered mutation broadcast by the server authority. */
export interface OpMessage {
  type: "op";
  docId: string;
  revision: number;
  sourceId: string;
  clientSeq: number;
  intents: EditIntent[];
}

/** Messages the server sends to the browser. */
export type ServerMessage =
  | SnapshotMessage
  | OpMessage
  | { type: "presence"; docId: string; peers: Peer[] }
  | { type: "error"; docId: string; message: string };

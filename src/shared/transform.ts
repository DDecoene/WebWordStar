import type { EditIntent, Position, TextDocument } from "./types";
import { applyIntent, getRange } from "./document";

/**
 * Positional transform for server-authoritative collaboration: shift positions
 * and intents past an already-applied operation so concurrent edits land where
 * the user meant them. Deliberately simple (not full OT): ties resolve in
 * server serialization order — the applied op wins.
 */

/** Number of lines a (possibly multiline) insert adds, and the length of its last part. */
function insertShape(text: string): { addedLines: number; lastLen: number } {
  const parts = text.split("\n");
  return { addedLines: parts.length - 1, lastLen: parts[parts.length - 1]!.length };
}

/** Position of the end of an insert of `text` at `at` (just past the inserted text). */
export function insertEnd(at: Position, text: string): Position {
  const { addedLines, lastLen } = insertShape(text);
  if (addedLines === 0) return { line: at.line, col: at.col + lastLen };
  return { line: at.line + addedLines, col: lastLen };
}

function isBefore(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.col < b.col);
}

/** Shift `pos` past an already-applied `op`. `before` breaks ties (true = the op wins and pos shifts). */
export function transformPosition(pos: Position, op: EditIntent, before = true): Position {
  switch (op.kind) {
    case "insertText": {
      const { at, text } = op;
      const { addedLines, lastLen } = insertShape(text);
      if (pos.line < at.line) return pos;
      if (pos.line > at.line) return { line: pos.line + addedLines, col: pos.col };
      // Same line.
      if (pos.col < at.col || (pos.col === at.col && !before)) return pos;
      if (addedLines === 0) return { line: pos.line, col: pos.col + lastLen };
      return { line: at.line + addedLines, col: lastLen + (pos.col - at.col) };
    }
    case "deleteRange": {
      const { start, end } = op;
      if (isBefore(pos, start) || (pos.line === start.line && pos.col === start.col)) return pos;
      if (isBefore(pos, end)) return { ...start }; // inside the deleted range: clamp
      if (pos.line === end.line) return { line: start.line, col: start.col + (pos.col - end.col) };
      return { line: pos.line - (end.line - start.line), col: pos.col };
    }
    case "splitLine": {
      const { at } = op;
      if (pos.line < at.line) return pos;
      if (pos.line > at.line) return { line: pos.line + 1, col: pos.col };
      if (pos.col < at.col || (pos.col === at.col && !before)) return pos;
      return { line: at.line + 1, col: pos.col - at.col };
    }
    case "setReturn":
      return pos;
  }
}

/** True if `pos` lies strictly inside the deleted range (exclusive of both ends). */
function strictlyInsideDelete(pos: Position, op: Extract<EditIntent, { kind: "deleteRange" }>): boolean {
  return isBefore(op.start, pos) && isBefore(pos, op.end);
}

/**
 * Shift every position in `intent` past the already-applied `op`.
 * Returns null when the intent no longer has anywhere to land (its position or
 * entire range was deleted by `op`).
 */
export function transformIntent(intent: EditIntent, op: EditIntent): EditIntent | null {
  switch (intent.kind) {
    case "insertText": {
      if (op.kind === "deleteRange" && strictlyInsideDelete(intent.at, op)) return null;
      return { ...intent, at: transformPosition(intent.at, op) };
    }
    case "deleteRange": {
      // Start holds its ground on ties (stays left of concurrent inserts); end yields
      // (widens over a concurrent insert inside the range).
      const start = transformPosition(intent.start, op, false);
      const end = transformPosition(intent.end, op, true);
      if (start.line === end.line && start.col === end.col) return null;
      return { ...intent, start, end };
    }
    case "splitLine": {
      if (op.kind === "deleteRange" && strictlyInsideDelete(intent.at, op)) return null;
      return { ...intent, at: transformPosition(intent.at, op) };
    }
    case "setReturn": {
      switch (op.kind) {
        case "insertText": {
          const { addedLines } = insertShape(op.text);
          if (addedLines > 0 && intent.line >= op.at.line)
            return { ...intent, line: intent.line + addedLines };
          return intent;
        }
        case "deleteRange": {
          const span = op.end.line - op.start.line;
          if (span === 0 || intent.line <= op.start.line) return intent;
          if (intent.line <= op.end.line) return { ...intent, line: op.start.line };
          return { ...intent, line: intent.line - span };
        }
        case "splitLine":
          if (intent.line >= op.at.line) return { ...intent, line: intent.line + 1 };
          return intent;
        case "setReturn":
          return intent;
      }
    }
  }
}

/** Fold `intents` past every op in `ops` (in order), dropping intents that are emptied. */
export function transformIntents(intents: EditIntent[], ops: EditIntent[]): EditIntent[] {
  const out: EditIntent[] = [];
  for (const intent of intents) {
    let current: EditIntent | null = intent;
    for (const op of ops) {
      current = transformIntent(current, op);
      if (current === null) break;
    }
    if (current !== null) out.push(current);
  }
  return out;
}

/** The intents that undo `intent` when applied to the post-state. `doc` is the pre-state. */
function invertIntent(doc: TextDocument, intent: EditIntent): EditIntent[] {
  switch (intent.kind) {
    case "insertText":
      return [{ kind: "deleteRange", start: intent.at, end: insertEnd(intent.at, intent.text) }];
    case "deleteRange": {
      const text = getRange(doc, intent.start, intent.end);
      const inverse: EditIntent[] = [{ kind: "insertText", at: intent.start, text }];
      // Re-inserting multiline text creates hard returns; restore any soft breaks.
      for (let line = intent.start.line; line < intent.end.line; line++) {
        if (doc.returns[line] === "soft") inverse.push({ kind: "setReturn", line, return: "soft" });
      }
      return inverse;
    }
    case "splitLine":
      return [
        {
          kind: "deleteRange",
          start: { line: intent.at.line, col: intent.at.col },
          end: { line: intent.at.line + 1, col: 0 },
        },
      ];
    case "setReturn":
      return [{ kind: "setReturn", line: intent.line, return: doc.returns[intent.line] ?? "hard" }];
  }
}

/**
 * Inverses for a sequential batch, in ready-to-apply order (reversed): applying
 * the result to the post-state of the batch restores `doc` exactly.
 */
export function invertIntents(doc: TextDocument, intents: EditIntent[]): EditIntent[] {
  const inverses: EditIntent[][] = [];
  let current = doc;
  for (const intent of intents) {
    inverses.push(invertIntent(current, intent));
    current = applyIntent(current, intent);
  }
  return inverses.reverse().flat();
}

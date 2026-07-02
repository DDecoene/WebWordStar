import type { TextDocument } from "./types";

export type DotCommand =
  | { kind: "lm" | "rm" | "ls" | "pl" | "mt" | "mb" | "cp"; value: number }
  | { kind: "pn"; value: number }
  | { kind: "pa" | "op" }
  | { kind: "he" | "fo"; text: string }
  | { kind: "unknown" };

const NUMERIC_KINDS = ["lm", "rm", "ls", "pl", "mt", "mb", "cp", "pn"] as const;
const NOARG_KINDS = ["pa", "op"] as const;
const TEXT_KINDS = ["he", "fo"] as const;

/** True when the first character of `text` is a "." */
export function isDotLine(text: string): boolean {
  return text.length > 0 && text[0] === ".";
}

/** Parse a single line into a DotCommand, or null if it is not a dot line. */
export function parseDotLine(text: string): DotCommand | null {
  if (!isDotLine(text)) return null;

  const rest = text.slice(1);
  const match = /^([A-Za-z]+)( .*)?$/.exec(rest);
  if (!match) {
    // "." alone, or non-letter command word
    return { kind: "unknown" };
  }
  const word = match[1]!.toLowerCase();
  const tail = match[2] ?? "";

  if ((NUMERIC_KINDS as readonly string[]).includes(word)) {
    const arg = tail.trim();
    if (!/^\d+$/.test(arg)) return { kind: "unknown" };
    const value = Number(arg);
    if (value <= 0) return { kind: "unknown" };
    return { kind: word, value } as DotCommand;
  }

  if ((NOARG_KINDS as readonly string[]).includes(word)) {
    if (tail.trim().length > 0) return { kind: "unknown" };
    return { kind: word as "pa" | "op" };
  }

  if ((TEXT_KINDS as readonly string[]).includes(word)) {
    // strip exactly one leading space from tail (tail starts with " " if present at all)
    const stripped = tail.startsWith(" ") ? tail.slice(1) : tail;
    return { kind: word as "he" | "fo", text: stripped };
  }

  return { kind: "unknown" };
}

export interface BaseSettings {
  left: number;
  right: number;
  spacing: number;
  pageLen?: number;
  marginTop?: number;
  marginBottom?: number;
}

export interface Layout {
  left: number;
  right: number;
  spacing: number;
  pageLen: number;
  marginTop: number;
  marginBottom: number;
  header: string;
  footer: string;
  pageNumber: number | null;
  omitPageNumbers: boolean;
}

/** Fold dot commands on lines strictly before `uptoLine`, top-down over `base`. */
export function scanLayout(doc: TextDocument, uptoLine: number, base: BaseSettings): Layout {
  const layout: Layout = {
    left: base.left,
    right: base.right,
    spacing: base.spacing,
    pageLen: base.pageLen ?? 66,
    marginTop: base.marginTop ?? 3,
    marginBottom: base.marginBottom ?? 8,
    header: "",
    footer: "",
    pageNumber: null,
    omitPageNumbers: false,
  };

  const limit = Math.min(uptoLine, doc.lines.length);
  for (let i = 0; i < limit; i++) {
    const cmd = parseDotLine(doc.lines[i]!);
    if (!cmd) continue;
    switch (cmd.kind) {
      case "lm": {
        const newLeft = cmd.value - 1;
        if (newLeft < layout.right) layout.left = newLeft;
        break;
      }
      case "rm": {
        const newRight = cmd.value - 1;
        if (layout.left < newRight) layout.right = newRight;
        break;
      }
      case "ls":
        layout.spacing = cmd.value;
        break;
      case "pl":
        layout.pageLen = cmd.value;
        break;
      case "mt":
        layout.marginTop = cmd.value;
        break;
      case "mb":
        layout.marginBottom = cmd.value;
        break;
      case "cp":
        // page-break-if-fewer-than-n-lines is a pagination concern; no layout effect
        break;
      case "pn":
        layout.pageNumber = cmd.value;
        break;
      case "pa":
        // forces a page break; no layout state effect
        break;
      case "op":
        layout.omitPageNumbers = true;
        break;
      case "he":
        layout.header = cmd.text;
        break;
      case "fo":
        layout.footer = cmd.text;
        break;
      case "unknown":
        break;
    }
  }
  return layout;
}

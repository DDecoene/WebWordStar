import type { TextDocument } from "./types";
import type { BaseSettings } from "./dot";
import { isDotLine, parseDotLine } from "./dot";

export interface Pagination {
  /** Last document line index of each page except the final page. */
  breaks: number[];
  /** 0-based page index per document line. */
  pageOfLine: number[];
  /** Displayed number of each page (default 1..N, .pn renumbers). */
  pageNumbers: number[];
  /** Per page: numbering omitted (.op seen at/before that page start). */
  omit: boolean[];
}

/**
 * Walk the document top-down, tracking the current page's used height against
 * its text-line capacity (pl - mt - mb), and emit page boundaries driven by the
 * layout dot commands.
 */
export function paginate(doc: TextDocument, base: BaseSettings): Pagination {
  const n = doc.lines.length;
  if (n === 0) {
    return { breaks: [], pageOfLine: [], pageNumbers: [1], omit: [false] };
  }

  let pl = base.pageLen ?? 66;
  let mt = base.marginTop ?? 3;
  let mb = base.marginBottom ?? 8;
  let ls = base.spacing ?? 1;

  // pl/mt/mb changes take effect starting the NEXT page.
  let pendingPl = pl;
  let pendingMt = mt;
  let pendingMb = mb;

  let capacity = pl - mt - mb;
  let used = 0;
  let currentPage = 0;

  let forceBreakFromPa = false;
  let pendingPnValue: number | null = null;
  let omitFromPage: number | null = null;

  const breaks: number[] = [];
  const pageOfLine: number[] = new Array(n);
  const overrides: Map<number, number> = new Map();

  for (let i = 0; i < n; i++) {
    const line = doc.lines[i]!;
    const cmd = isDotLine(line) ? parseDotLine(line) : null;

    // Decide whether a page break must happen BEFORE this line is placed.
    let needBreak = false;
    if (forceBreakFromPa) {
      needBreak = true;
    } else if (cmd && cmd.kind === "cp") {
      const slotsRemaining = Math.floor((capacity - used) / ls);
      if (slotsRemaining < cmd.value) needBreak = true;
    } else if (!cmd) {
      const remaining = capacity - used;
      if (remaining < ls) needBreak = true;
    }

    if (needBreak && i > 0) {
      breaks.push(i - 1);
      currentPage++;
      pl = pendingPl;
      mt = pendingMt;
      mb = pendingMb;
      capacity = pl - mt - mb;
      used = 0;
      forceBreakFromPa = false;
    }

    if (pendingPnValue !== null) {
      overrides.set(currentPage, pendingPnValue);
      pendingPnValue = null;
    }

    pageOfLine[i] = currentPage;

    if (cmd) {
      switch (cmd.kind) {
        case "pl":
          pendingPl = cmd.value;
          break;
        case "mt":
          pendingMt = cmd.value;
          break;
        case "mb":
          pendingMb = cmd.value;
          break;
        case "ls":
          ls = cmd.value;
          break;
        case "pn":
          pendingPnValue = cmd.value;
          break;
        case "op":
          if (omitFromPage === null) omitFromPage = currentPage;
          break;
        case "pa":
          forceBreakFromPa = true;
          break;
        case "cp":
        case "lm":
        case "rm":
        case "he":
        case "fo":
        case "unknown":
          break;
      }
    } else {
      used += ls;
    }
  }

  const pageCount = currentPage + 1;
  const pageNumbers: number[] = new Array(pageCount);
  for (let p = 0; p < pageCount; p++) {
    const override = overrides.get(p);
    if (override !== undefined) {
      pageNumbers[p] = override;
    } else {
      pageNumbers[p] = p === 0 ? 1 : pageNumbers[p - 1]! + 1;
    }
  }

  const omit: boolean[] = new Array(pageCount);
  for (let p = 0; p < pageCount; p++) {
    omit[p] = omitFromPage !== null && p >= omitFromPage;
  }

  return { breaks, pageOfLine, pageNumbers, omit };
}

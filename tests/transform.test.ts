import { describe, it, expect } from "vitest";
import { createDocument, getText, applyIntent } from "../src/shared/document";
import {
  transformPosition,
  transformIntent,
  transformIntents,
  invertIntents,
} from "../src/shared/transform";
import type { EditIntent, Position, TextDocument } from "../src/shared/types";

const pos = (line: number, col: number): Position => ({ line, col });
const ins = (line: number, col: number, text: string): EditIntent => ({
  kind: "insertText",
  at: pos(line, col),
  text,
});
const del = (sl: number, sc: number, el: number, ec: number): EditIntent => ({
  kind: "deleteRange",
  start: pos(sl, sc),
  end: pos(el, ec),
});
const split = (line: number, col: number, brk: "hard" | "soft" = "hard"): EditIntent => ({
  kind: "splitLine",
  at: pos(line, col),
  break: brk,
});

function applyAll(doc: TextDocument, intents: EditIntent[]): TextDocument {
  return intents.reduce(applyIntent, doc);
}

describe("transformPosition", () => {
  it("shifts right past an insert before it on the same line", () => {
    expect(transformPosition(pos(0, 5), ins(0, 2, "ab"))).toEqual(pos(0, 7));
  });

  it("is unmoved by an insert after it", () => {
    expect(transformPosition(pos(0, 2), ins(0, 5, "ab"))).toEqual(pos(0, 2));
  });

  it("yields at a tie by default (op wins: pos shifts right)", () => {
    expect(transformPosition(pos(0, 2), ins(0, 2, "ab"))).toEqual(pos(0, 4));
  });

  it("stays put at a tie when before=false", () => {
    expect(transformPosition(pos(0, 2), ins(0, 2, "ab"), false)).toEqual(pos(0, 2));
  });

  it("moves down and re-bases col past a multiline insert on its line", () => {
    // "xx\nyy" inserted at (0,1): position (0,3) was 2 past the insert point,
    // ends up on the last inserted line at col 2 + 2.
    expect(transformPosition(pos(0, 3), ins(0, 1, "xx\nyy"))).toEqual(pos(1, 4));
  });

  it("shifts lines down past a multiline insert on an earlier line", () => {
    expect(transformPosition(pos(3, 4), ins(1, 0, "a\nb\nc"))).toEqual(pos(5, 4));
  });

  it("shifts left past a same-line delete before it", () => {
    expect(transformPosition(pos(0, 5), del(0, 1, 0, 3))).toEqual(pos(0, 3));
  });

  it("clamps to the start of a delete range containing it", () => {
    expect(transformPosition(pos(0, 2), del(0, 1, 0, 5))).toEqual(pos(0, 1));
  });

  it("re-bases onto the joined line past a multi-line delete ending before it", () => {
    // delete (0,2)..(2,1): a position at (2,4) lands at (0, 2 + (4-1)).
    expect(transformPosition(pos(2, 4), del(0, 2, 2, 1))).toEqual(pos(0, 5));
  });

  it("shifts line numbers up past a multi-line delete on earlier lines", () => {
    expect(transformPosition(pos(5, 3), del(1, 0, 3, 0))).toEqual(pos(3, 3));
  });

  it("moves past a split before it on the same line", () => {
    expect(transformPosition(pos(0, 5), split(0, 2))).toEqual(pos(1, 3));
  });

  it("keeps positions before the split point", () => {
    expect(transformPosition(pos(0, 1), split(0, 2))).toEqual(pos(0, 1));
  });

  it("shifts lines below a split down by one", () => {
    expect(transformPosition(pos(2, 3), split(0, 0))).toEqual(pos(3, 3));
  });

  it("is unmoved by setReturn", () => {
    expect(
      transformPosition(pos(1, 2), { kind: "setReturn", line: 0, return: "soft" }),
    ).toEqual(pos(1, 2));
  });
});

describe("transformIntent", () => {
  it("shifts an insert past a concurrent earlier insert on the same line", () => {
    expect(transformIntent(ins(0, 5, "B"), ins(0, 2, "AA"))).toEqual(ins(0, 7, "B"));
  });

  it("shifts a delete range past an insert inside it", () => {
    // Insert at (0,3) of "XY" inside delete (0,1)..(0,5): the delete widens to cover it.
    expect(transformIntent(del(0, 1, 0, 5), ins(0, 3, "XY"))).toEqual(del(0, 1, 0, 7));
  });

  it("returns null when the intent's range is fully deleted", () => {
    expect(transformIntent(ins(0, 3, "x"), del(0, 1, 0, 5))).toBeNull();
  });

  it("keeps a delete whose range partially survives", () => {
    // delete (0,2)..(0,6) transformed past delete (0,0)..(0,4): survives as (0,0)..(0,2)
    expect(transformIntent(del(0, 2, 0, 6), del(0, 0, 0, 4))).toEqual(del(0, 0, 0, 2));
  });

  it("returns null for a delete fully inside another delete", () => {
    expect(transformIntent(del(0, 2, 0, 3), del(0, 1, 0, 5))).toBeNull();
  });

  it("moves a split past an earlier split on the same line", () => {
    expect(transformIntent(split(0, 5), split(0, 2))).toEqual(split(1, 3));
  });

  it("setReturn line shifts past a split above it", () => {
    expect(
      transformIntent({ kind: "setReturn", line: 2, return: "soft" }, split(0, 0)),
    ).toEqual({ kind: "setReturn", line: 3, return: "soft" });
  });
});

describe("convergence", () => {
  it("two same-line concurrent inserts converge under server order", () => {
    const base = createDocument("hello world");
    const a = ins(0, 0, "A");
    const b = ins(0, 11, "B");
    // Server applies a then transforms b past a.
    const serverDoc = applyAll(base, [a, transformIntent(b, a)!]);
    // Client B applied b optimistically, then receives a transformed past its pending b.
    const clientB = applyAll(base, [b, transformIntent(a, b)!]);
    expect(getText(serverDoc)).toBe("Ahello worldB");
    expect(getText(clientB)).toBe(getText(serverDoc));
  });

  it("insert vs delete on the same line converge", () => {
    const base = createDocument("abcdef");
    const a = del(0, 1, 0, 3); // remove "bc"
    const b = ins(0, 4, "X"); // "abcdXef"
    const serverDoc = applyAll(base, [a, transformIntent(b, a)!]);
    const clientB = applyAll(base, [b, transformIntent(a, b)!]);
    expect(getText(serverDoc)).toBe("adXef");
    expect(getText(clientB)).toBe(getText(serverDoc));
  });
});

describe("invertIntents", () => {
  function roundTrip(text: string, intents: EditIntent[], returns?: ("hard" | "soft")[]) {
    const doc = createDocument(text);
    if (returns) doc.returns = returns;
    const after = applyAll(doc, intents);
    const restored = applyAll(after, invertIntents(doc, intents));
    expect(restored.lines).toEqual(doc.lines);
    expect(restored.returns).toEqual(doc.returns);
  }

  it("inverts a single-line insert", () => {
    roundTrip("abc", [ins(0, 1, "XY")]);
  });

  it("inverts a multiline insert", () => {
    roundTrip("abc", [ins(0, 1, "X\nY\nZ")]);
  });

  it("inverts a same-line delete", () => {
    roundTrip("abcdef", [del(0, 1, 0, 4)]);
  });

  it("inverts a multi-line delete preserving soft returns", () => {
    roundTrip("one two\nthree\nfour", [del(0, 3, 2, 2)], ["soft", "soft", "hard"]);
  });

  it("inverts a soft split", () => {
    roundTrip("abcd", [split(0, 2, "soft")]);
  });

  it("inverts setReturn", () => {
    roundTrip("a\nb", [{ kind: "setReturn", line: 0, return: "soft" }]);
  });

  it("inverts a batch in order (delete then insert, as in block move)", () => {
    roundTrip("one\ntwo\nthree", [del(0, 0, 1, 0), ins(1, 0, "one\n")]);
  });
});

describe("transformIntents", () => {
  it("folds a batch past a batch, dropping emptied intents", () => {
    const out = transformIntents([ins(0, 3, "x"), ins(0, 8, "y")], [del(0, 1, 0, 5)]);
    expect(out).toEqual([ins(0, 4, "y")]);
  });
});

import { describe, it, expect } from "vitest";
import { decodeWordStar, looksBinary } from "../src/shared/wsImport";

describe("decodeWordStar", () => {
  it("decodes a synthetic WS4-style fixture exactly", () => {
    const bytes: number[] = [];
    const push = (s: string) => {
      for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    };

    // "hell" + high-bit-set 'o' (0x6F | 0x80 = 0xEF) -> word-end tagging
    push("hell");
    bytes.push(0x6f | 0x80);
    bytes.push(0x20); // space
    push("world");

    // Soft return sequence: 0x8D 0x8A (soft CR + soft LF) -> both consumed, emits one "\n"
    bytes.push(0x8d, 0x8a);

    // Hard CRLF
    push("hard line");
    bytes.push(0x0d, 0x0a);

    // Dot line passes through as text
    push(".lm 5");
    bytes.push(0x0a);

    // Embedded control-char pair (bold toggle 0x02)
    bytes.push(0x02);
    push("bold");
    bytes.push(0x02);
    bytes.push(0x0a);

    // Soft hyphen dropped
    push("soft");
    bytes.push(0x1f);
    push("hyphen");

    const decoded = decodeWordStar(new Uint8Array(bytes));

    const expected =
      "hell" +
      "o" +
      " world" +
      "\n" +
      "hard line" +
      "\n" +
      ".lm 5" +
      "\n" +
      "\x02bold\x02" +
      "\n" +
      "softhyphen";

    expect(decoded).toBe(expected);
  });

  it("consumes a lone soft CR without a trailing soft LF", () => {
    const bytes = new Uint8Array([0x61, 0x8d, 0x62]); // "a" <soft CR> "b"
    expect(decodeWordStar(bytes)).toBe("a\nb");
  });

  it("drops other C0 control chars but keeps tab and newline", () => {
    const bytes = new Uint8Array([0x61, 0x01, 0x09, 0x62, 0x7f, 0x0a]);
    expect(decodeWordStar(bytes)).toBe("a\tb\n");
  });

  it("looksBinary is false for the synthetic WS4 fixture", () => {
    const fixture = "hello world\n.lm 5\n\x02bold\x02\nsoft text";
    expect(looksBinary(fixture)).toBe(false);
  });

  it("looksBinary is true for random binary bytes", () => {
    const bytes: number[] = [];
    for (let i = 0; i < 200; i++) bytes.push((i * 37 + 5) % 32); // dense C0 control bytes
    // Decode won't strip these below 0x20 except tab/newline, so build the
    // "decoded" string directly to simulate a binary blob post-decode.
    let decoded = "";
    for (const b of bytes) decoded += String.fromCharCode(b);
    expect(looksBinary(decoded)).toBe(true);
  });

  it("looksBinary is false for an empty string", () => {
    expect(looksBinary("")).toBe(false);
  });
});

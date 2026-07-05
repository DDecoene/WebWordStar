/**
 * Decoder for imported WordStar 3.x/4 (and plain-text) files, per the
 * "Documents In and Out" design (^K R read file).
 *
 * Stored document content today has no way to distinguish a hard return from
 * a soft return: `getText`/`createDocument` round-trip through a plain "\n"
 * joined string and `createDocument` always marks every line as "hard" (see
 * src/shared/document.ts). So a WordStar soft return (0x8D, optionally
 * followed by the soft-LF 0x8A) decodes to a plain "\n" here as well — there
 * is no richer representation to target without changing the stored-content
 * format, which is out of scope for this feature.
 */

/** Control characters we keep verbatim: the ^P print-style codes we already use. */
const KNOWN_CONTROLS = new Set<number>([0x02, 0x13, 0x19, 0x04, 0x18, 0x14, 0x16, 0x0f]);

/**
 * Decode raw file bytes (plain text, native .ws, or WordStar 3.x/4 binary
 * text) into the string form used as document content.
 */
export function decodeWordStar(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const len = bytes.length;

  while (i < len) {
    const b = bytes[i]!;

    // Normalize CRLF / lone CR to LF.
    if (b === 0x0d) {
      if (bytes[i + 1] === 0x0a) i += 2;
      else i += 1;
      out += "\n";
      continue;
    }

    // Soft CR: WordStar's soft line break. The stored content format cannot
    // express soft vs. hard returns, so emit a plain newline. Consume a
    // trailing soft LF (0x8A) if present.
    if (b === 0x8d) {
      out += "\n";
      i += 1;
      if (bytes[i] === 0x8a) i += 1;
      continue;
    }

    // Soft hyphen: dropped.
    if (b === 0x1f || b === 0x8f) {
      i += 1;
      continue;
    }

    // Any other high-bit byte: WordStar's justification/word-end tagging —
    // keep the low 7 bits.
    if (b >= 0x80) {
      out += String.fromCharCode(b & 0x7f);
      i += 1;
      continue;
    }

    // Known print-control chars, tab, and LF pass through.
    if (KNOWN_CONTROLS.has(b) || b === 0x09 || b === 0x0a) {
      out += String.fromCharCode(b);
      i += 1;
      continue;
    }

    // Other C0 control chars are dropped.
    if (b < 0x20 || b === 0x7f) {
      i += 1;
      continue;
    }

    // Printable ASCII (and anything else <0x80) passes through.
    out += String.fromCharCode(b);
    i += 1;
  }

  return out;
}

/**
 * Heuristic rejection of binary / WordStar 5+ style-sheet formats: true when
 * more than ~10% of the decoded characters fall outside printable ASCII, our
 * known print-control chars, and whitespace.
 */
export function looksBinary(decoded: string): boolean {
  if (decoded.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i);
    const printable = c >= 0x20 && c < 0x7f;
    const whitespace = c === 0x09 || c === 0x0a || c === 0x0d;
    const known = KNOWN_CONTROLS.has(c);
    if (!printable && !whitespace && !known) bad++;
  }
  return bad / decoded.length > 0.1;
}

# Documents In and Out — Design

**Status: implemented (2026-07-03).** Deviation from this design: the stored document
content has no representation for WordStar's soft return — imported WordStar soft
returns are recorded as **hard** returns (documented in `wsImport.ts`).

**Date:** 2026-07-03 · **Milestone:** v1.0.0 · **Follow-up to:** #9 print/export

Three related capabilities: a feature-showcase demo document, native WordStar-text
export, and import/open of files — including real WordStar 3.x/4 documents.

## 1. Demo document

- **Template** in `src/shared/demo.ts`: a single exported constant (WordStar-flavored
  text) exercising every shipped feature — prose to navigate with the diamond/`^Q`,
  every `^P` print style, a `^OC`-centered heading, `.lm`/`.rm`/`.ls` margin changes,
  `.he`/`.fo` header/footer, `.pa` and `.cp` page breaks.
- **Route:** `GET /demo` (server) creates a **new** document seeded from the template
  (title "DEMO DOCUMENT") and 302-redirects to `/?doc=<uuid>` — every visitor gets a
  private copy. In dev, Vite proxies `/demo` to the WS server.
- The template must export cleanly in all four formats (tested).

## 2. Native export (.ws)

- `^K P` prompt gains **W**: `PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown W=WordStar`.
- `GET /export/<docId>.ws` serves the **stored content verbatim**
  (`application/octet-stream`, filename `<title>.ws`). Round-trips by construction.

## 3. Import / open (`^K R`)

- **UI:** `^K R` ("read file", faithful to WordStar's ^KR) opens the browser file
  picker (temporary `<input type="file">`). The file is POSTed to the server; the
  response is the new document's id; the browser navigates to `/?doc=<id>`. Title =
  filename without extension.
- **Endpoint:** `POST /import` — body is the raw file bytes; optional
  `X-Document-Title` header (or `?title=` query) carries the sanitized title.
  Responds `{ id }` JSON. 400 for empty body or detected-unsupported format.
- **Decoder** in `src/shared/wsImport.ts` — `decodeWordStar(bytes: Uint8Array): string`:
  - Plain text / native `.ws` passes through (after newline normalization).
  - WordStar 3.x/4: bytes with the high bit set are WordStar's justification/soft
    markers. Mapping: `0x8D` (soft CR) → newline flagged soft on load; `0x8A` soft LF
    dropped; `0x1F`/`0x8F` soft hyphen → drop; any other byte ≥ 0x80 → low 7 bits
    (soft-space/word-end tagging). Control chars we already use (`\x02 \x13 \x19 \x04
    \x18 \x14 \x16 \x0F`) pass through; other C0 chars are dropped. Dot-command lines
    pass through as text.
  - Soft returns: the decoder returns both text and a per-line hard/soft list so the
    document model keeps WordStar's paragraph structure (reuse the model's existing
    hard/soft return flags; check how content is serialized today and keep that path).
  - WordStar 5/6/7 detection: those files start with binary/style-sheet structures
    (high density of bytes that are neither text-with-high-bit nor known controls);
    heuristic — if after decoding more than ~10% of characters are non-printable,
    reject with a clear error surfaced to the user (alert-free: shown in the editor
    status/prompt line or a plain error page is acceptable; simplest robust choice OK).

## Error handling

`/import` 400s with a plain-text reason; the client surfaces failure without crashing.
`/demo` works with no query params; repeated visits create new documents.

## Testing

- Vitest: demo template exports in all four formats without error and contains the
  expected markers; `.ws` export round-trip (import(export(doc)) == stored content);
  `decodeWordStar` against a synthetic WS4-style fixture (high-bit words, 0x8D soft
  returns, dot lines, control chars) and rejection of a binary blob.
- Playwright: `/demo` lands on a seeded document; `^KP` → W downloads `<title>.ws`;
  `^KR` uploads a fixture file and lands on a new document with its content.

## DoD

CHANGELOG (Added), README + CLAUDE.md (command tables: `^K P` W option, `^K R`;
architecture tree: `demo.ts`, `wsImport.ts`; roadmap), spec self-note, screenshots if
UI changed.

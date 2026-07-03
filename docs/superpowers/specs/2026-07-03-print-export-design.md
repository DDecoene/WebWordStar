# Print/Export (#9) — Design

**Date:** 2026-07-03 · **Milestone:** v1.0.0 · **Issue:** #9 · **Spec ref:** v1.0.0 design §4.7

Render the document model to PDF, HTML, plain text, and Markdown, honouring the layout
dot commands and the embedded `^P` print-control characters. No legacy `.ws` export.

## Architecture

- **`src/shared/export.ts`** (new, pure): text, Markdown, and HTML renderers — string in,
  string out; runs in Node and in tests. Includes a run parser that walks a line's embedded
  control chars (`\x02` bold, `\x13` underline, `\x19` italic, `\x04` double-strike,
  `\x18` strikeout, `\x14` superscript, `\x16` subscript, `\x0f` non-break space) with
  WordStar toggle semantics, producing styled text runs.
- **`server/pdf.ts`** (new, server-only): PDF renderer using **pdfkit**.
- **`server/index.ts`**: new REST route
  `GET /export/:docId.(pdf|html|txt|md)` → load document from `DocumentStore`, render,
  respond with correct `Content-Type` and
  `Content-Disposition: attachment; filename="<title>.<ext>"`.
- Renderers reuse `scanLayout` (margins, header/footer, spacing) and `paginate`
  (page breaks, real page numbers, `.op`).

## Per-format behaviour

### Plain text (`.txt`)
UTF-8. Dot-command lines and all control chars stripped. Lines emitted at their existing
(wrapped) line breaks. No page decoration.

### Markdown (`.md`)
Soft-wrapped lines of a paragraph joined into a single line per paragraph (hard returns
delimit paragraphs). Styles: `**bold**`, `*italic*`, `~~strikeout~~`; underline,
double-strike, super/subscript dropped. Dot lines stripped; `.pa` emits `---`.

### HTML (`.html`)
Standalone semantic document: `<p>` per paragraph, `<b>/<i>/<u>/<s>/<sup>/<sub>` for
styles, centered lines honoured, `<hr class="page-break">` at `paginate` boundaries with
`@media print { break-after: page }` CSS, `<title>` from the document title. Headers and
footers are **not** rendered in HTML (PDF only).

### PDF (`.pdf`)
pdfkit, Courier family. Page geometry driven by the layout: line height = page height /
`.pl`; text area top/bottom from `.mt`/`.mb` line counts; left/right offsets from
`.lm`/`.rm` column positions at the monospace advance width. One rendered line per
document line, advancing `.ls` line slots. Page breaks exactly where `paginate` says.
`.he`/`.fo` printed in the top/bottom margin with `#` replaced by the real page number;
default footer shows the page number unless `.op`. Styles: Courier-Bold /
Courier-Oblique / Courier-BoldOblique, underline/strikeout via pdfkit options,
double-strike rendered as bold, super/subscript as smaller text raised/lowered.

## Editor UI

`^K P` enters an inline prompt (like `^KN`):
`PRINT/EXPORT — P=PDF H=HTML T=Text M=Markdown` (Esc cancels). On selection, `main.ts`
triggers a download of `/export/<docId>.<ext>` via a temporary anchor click. The `^K`
self-revealing menu gains the `P` entry.

## Error handling

Unknown document id → 404. Unknown extension → 400. Client export is fire-and-forget;
the browser handles the download.

## Testing

- **Vitest:** unit tests for the run parser and each renderer (txt/md/html string
  assertions; PDF asserted structurally — `%PDF` magic, page count, contains expected
  text); integration test against the export endpoint with a seeded store.
- **Playwright:** e2e — type styled multi-page content, `^K P` → each format, assert
  download filename and content (txt/md/html fully; PDF magic bytes + page count).

## Documentation (DoD)

CHANGELOG entry, README + CLAUDE.md command tables (`^K P`) and roadmap checkbox,
spec §4.7 marked done, screenshots if UI changed.

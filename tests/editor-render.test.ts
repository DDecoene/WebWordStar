import { describe, it, expect } from "vitest";
import { renderEditor } from "../src/editor/render";
import { createEditorState } from "../src/editor/state";

describe("renderEditor", () => {
  it("renders a status line with one-based line/col and the mode", () => {
    const s = createEditorState("hello", "DOC.TXT");
    const html = renderEditor(s);
    expect(html).toContain("DOC.TXT");
    expect(html).toContain("LINE 1");
    expect(html).toContain("COL 1");
    expect(html).toContain("INSERT");
  });

  it("shows OVERTYPE when in overtype mode", () => {
    const s = { ...createEditorState("x"), mode: "overtype" as const };
    expect(renderEditor(s)).toContain("OVERTYPE");
  });

  it("renders the document text in the screen region", () => {
    const s = { ...createEditorState("alpha\nbeta"), cursor: { line: 0, col: 5 } };
    const html = renderEditor(s);
    expect(html).toContain("alpha");
    expect(html).toContain("beta");
  });

  it("marks the cursor cell with a cursor span", () => {
    const s = { ...createEditorState("ab"), cursor: { line: 0, col: 1 } };
    const html = renderEditor(s);
    expect(html).toContain('<span class="cursor">b</span>');
  });

  it("renders a block cursor at end of line as a space cell", () => {
    const s = { ...createEditorState("ab"), cursor: { line: 0, col: 2 } };
    const html = renderEditor(s);
    expect(html).toContain('<span class="cursor"> </span>');
  });

  it("escapes HTML special characters in the text", () => {
    const s = { ...createEditorState("a<b>&c"), cursor: { line: 0, col: 6 } };
    const html = renderEditor(s);
    expect(html).toContain("a&lt;b&gt;&amp;c");
  });
});

describe("prompt rendering", () => {
  it("shows the prompt label and buffer in the status area when a prompt is active", () => {
    const s = { ...createEditorState("body", "UNTITLED"), prompt: { label: "DOCUMENT NAME:", buffer: "My Doc", target: "filename" as const } };
    const html = renderEditor(s);
    expect(html).toContain("DOCUMENT NAME:");
    expect(html).toContain("My Doc");
  });

  it("shows the normal status line when no prompt is active", () => {
    const s = createEditorState("body", "UNTITLED");
    const html = renderEditor(s);
    expect(html).toContain("LINE 1");
    expect(html).not.toContain("DOCUMENT NAME:");
  });

  it("suppresses the document cursor while a prompt is active (no double caret)", () => {
    const s = { ...createEditorState("hello"), prompt: { label: "DOCUMENT NAME:", buffer: "", target: "filename" as const } };
    const html = renderEditor(s);
    // The only caret is the prompt's, in the status bar — the screen has none.
    const screen = html.split('data-testid="screen">')[1]!;
    expect(screen).not.toContain('class="cursor"');
  });
});

describe("block highlight rendering", () => {
  it("wraps the marked block region in a block span", () => {
    const s = {
      ...createEditorState("abcdef"),
      cursor: { line: 0, col: 6 }, // keep cursor out of the block for a clean assertion
      blockStart: { line: 0, col: 1 },
      blockEnd: { line: 0, col: 4 },
    };
    const html = renderEditor(s);
    expect(html).toContain('<span class="block">bcd</span>');
  });

  it("does not render the highlight when hideBlock is true", () => {
    const s = {
      ...createEditorState("abcdef"),
      cursor: { line: 0, col: 6 },
      blockStart: { line: 0, col: 1 },
      blockEnd: { line: 0, col: 4 },
      hideBlock: true,
    };
    expect(renderEditor(s)).not.toContain('class="block"');
  });
});

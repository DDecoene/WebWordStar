import { describe, it, expect } from "vitest";
import { createEditorState, applyKey } from "../src/editor/state";

describe("export prompt mode (^KP)", () => {
  it("^KP opens a PRINT/EXPORT prompt with export target", () => {
    let s = createEditorState("body", "UNTITLED");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "p", ctrl: false });
    expect(s.prompt).toEqual({ label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" });
  });

  it("pressing P selects PDF export and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "P", ctrl: false });
    expect(s.pendingExport).toBe("pdf");
    expect(s.prompt).toBeNull();
  });

  it("pressing p (lowercase) selects PDF export and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "p", ctrl: false });
    expect(s.pendingExport).toBe("pdf");
    expect(s.prompt).toBeNull();
  });

  it("pressing H selects HTML export and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "H", ctrl: false });
    expect(s.pendingExport).toBe("html");
    expect(s.prompt).toBeNull();
  });

  it("pressing T selects text export and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "T", ctrl: false });
    expect(s.pendingExport).toBe("txt");
    expect(s.prompt).toBeNull();
  });

  it("pressing M selects Markdown export and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "M", ctrl: false });
    expect(s.pendingExport).toBe("md");
    expect(s.prompt).toBeNull();
  });

  it("Escape cancels the export prompt without setting pendingExport", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "Escape", ctrl: false });
    expect(s.pendingExport).toBeNull();
    expect(s.prompt).toBeNull();
  });

  it("invalid key in export prompt is ignored (returns unchanged state)", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" } };
    s = applyKey(s, { key: "X", ctrl: false });
    // Prompt should still be active
    expect(s.prompt).toEqual({ label: "PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown", buffer: "", target: "export" });
    expect(s.pendingExport).toBeNull();
  });
});

describe("title prompt mode (^KN)", () => {
  it("^KN opens an empty DOCUMENT NAME prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "n", ctrl: false });
    expect(s.prompt).toEqual({ label: "DOCUMENT NAME:", buffer: "", target: "filename" });
  });

  it("typing edits the prompt buffer, not the document", () => {
    let s = createEditorState("body", "");
    s = applyKey(s, { key: "k", ctrl: true });
    s = applyKey(s, { key: "n", ctrl: false });
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "", target: "filename" } }; // start empty for clarity
    s = applyKey(s, { key: "H", ctrl: false });
    s = applyKey(s, { key: "i", ctrl: false });
    expect(s.prompt!.buffer).toBe("Hi");
    expect(s.document.lines).toEqual(["body"]);
  });

  it("Backspace trims the prompt buffer", () => {
    let s = createEditorState("body");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "Hi", target: "filename" } };
    s = applyKey(s, { key: "Backspace", ctrl: false });
    expect(s.prompt!.buffer).toBe("H");
  });

  it("Enter commits the buffer to filename and closes the prompt", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "My Letter", target: "filename" } };
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.filename).toBe("My Letter");
    expect(s.prompt).toBeNull();
  });

  it("Escape cancels without changing the filename", () => {
    let s = createEditorState("body", "UNTITLED");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "discard", target: "filename" } };
    s = applyKey(s, { key: "Escape", ctrl: false });
    expect(s.filename).toBe("UNTITLED");
    expect(s.prompt).toBeNull();
  });

  it("a committed empty buffer is ignored (keeps the previous filename)", () => {
    let s = createEditorState("body", "Keep");
    s = { ...s, prompt: { label: "DOCUMENT NAME:", buffer: "", target: "filename" } };
    s = applyKey(s, { key: "Enter", ctrl: false });
    expect(s.filename).toBe("Keep");
    expect(s.prompt).toBeNull();
  });
});

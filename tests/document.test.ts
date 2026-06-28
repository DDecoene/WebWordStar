import { describe, it, expect } from "vitest";
import { createDocument, getText } from "../src/shared/document";

describe("createDocument / getText", () => {
  it("creates an empty document with one empty line", () => {
    const doc = createDocument();
    expect(doc.lines).toEqual([""]);
    expect(getText(doc)).toBe("");
  });

  it("creates a document from initial text, splitting on newlines", () => {
    const doc = createDocument("alpha\nbeta");
    expect(doc.lines).toEqual(["alpha", "beta"]);
    expect(getText(doc)).toBe("alpha\nbeta");
  });
});

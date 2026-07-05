import { describe, it, expect, beforeEach } from "vitest";
import { handleExport } from "../server/index";
import { DocumentStore } from "../server/DocumentStore";

describe("handleExport endpoint", () => {
  let store: DocumentStore;

  beforeEach(() => {
    // Use in-memory SQLite database for tests
    store = new DocumentStore(":memory:");
  });

  describe("document lookup", () => {
    it("returns 404 for unknown document id", async () => {
      const result = await handleExport(store, "nonexistent-id", "txt");
      expect(result.status).toBe(404);
      expect(result.contentType).toBe("text/plain; charset=utf-8");
      expect(result.body).toBe("not found");
    });
  });

  describe("extension validation", () => {
    it("returns 400 for invalid extension", async () => {
      const result = await handleExport(store, "doc-id", "docx");
      expect(result.status).toBe(400);
      expect(result.contentType).toBe("text/plain; charset=utf-8");
      expect(result.body).toBe("bad request: invalid export format");
    });

    it("returns 400 for unsupported extension", async () => {
      const result = await handleExport(store, "doc-id", "xyz");
      expect(result.status).toBe(400);
    });
  });

  describe("plain text export", () => {
    it("exports simple text as txt", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "hello\nworld");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("text/plain; charset=utf-8");
      expect(result.body).toBe("hello\nworld\n");
      expect(result.filename).toBe("UNTITLED.txt");
    });

    it("strips control characters from txt export", async () => {
      store.create("test-doc");
      // \x02 is bold toggle
      store.saveContent("test-doc", "hel\x02lo\x02 world");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.body).toBe("hello world\n");
    });

    it("strips dot-command lines from txt export", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "line 1\n.lm 10\nline 2");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.body).toBe("line 1\nline 2\n");
    });
  });

  describe("markdown export", () => {
    it("exports simple text as md", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "hello\nworld");

      const result = await handleExport(store, "test-doc", "md");
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("text/markdown; charset=utf-8");
      // Each line is a separate paragraph (hard return)
      expect(result.body).toContain("hello");
      expect(result.body).toContain("world");
      expect(result.filename).toBe("UNTITLED.md");
    });

    it("converts bold markdown (**text**)", async () => {
      store.create("test-doc");
      // \x02 is bold toggle
      store.saveContent("test-doc", "hi \x02bold\x02 there");

      const result = await handleExport(store, "test-doc", "md");
      expect(result.status).toBe(200);
      expect(result.body).toContain("**bold**");
    });

    it("converts italic markdown (*text*)", async () => {
      store.create("test-doc");
      // \x19 is italic toggle
      store.saveContent("test-doc", "hi \x19italic\x19 there");

      const result = await handleExport(store, "test-doc", "md");
      expect(result.status).toBe(200);
      expect(result.body).toContain("*italic*");
    });

    it("handles .pa (page break) as separator", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "page 1\n.pa\npage 2");

      const result = await handleExport(store, "test-doc", "md");
      expect(result.status).toBe(200);
      expect(result.body).toContain("---");
    });
  });

  describe("HTML export", () => {
    it("exports simple text as html", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "hello world");

      const result = await handleExport(store, "test-doc", "html");
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("text/html; charset=utf-8");
      expect(typeof result.body).toBe("string");
      const html = result.body as string;
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("<title>UNTITLED</title>");
      expect(html).toContain("<p>hello world</p>");
      expect(html).toContain("</html>");
      expect(result.filename).toBe("UNTITLED.html");
    });

    it("escapes HTML special characters", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "a & b < c > d \"quoted\"");

      const result = await handleExport(store, "test-doc", "html");
      expect(result.status).toBe(200);
      const html = result.body as string;
      expect(html).toContain("&amp;");
      expect(html).toContain("&lt;");
      expect(html).toContain("&gt;");
      expect(html).toContain("&quot;");
    });

    it("includes title in html head", async () => {
      store.create("my-doc");
      store.saveContent("my-doc", "content");
      store.saveTitle("my-doc", "My Document");

      const result = await handleExport(store, "my-doc", "html");
      expect(result.status).toBe(200);
      const html = result.body as string;
      expect(html).toContain("<title>My Document</title>");
      expect(result.filename).toBe("My Document.html");
    });

    it("renders bold text as <b>", async () => {
      store.create("test-doc");
      // \x02 is bold toggle
      store.saveContent("test-doc", "say \x02hello\x02 now");

      const result = await handleExport(store, "test-doc", "html");
      expect(result.status).toBe(200);
      const html = result.body as string;
      expect(html).toContain("<b>hello</b>");
    });

    it("renders italic text as <i>", async () => {
      store.create("test-doc");
      // \x19 is italic toggle
      store.saveContent("test-doc", "say \x19hello\x19 now");

      const result = await handleExport(store, "test-doc", "html");
      expect(result.status).toBe(200);
      const html = result.body as string;
      expect(html).toContain("<i>hello</i>");
    });

    it("includes page-break CSS", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "html");
      expect(result.status).toBe(200);
      const html = result.body as string;
      expect(html).toContain("page-break");
      expect(html).toContain("@media print");
    });
  });

  describe("WordStar native export", () => {
    it("exports the stored content byte-for-byte", async () => {
      store.create("test-doc");
      const raw = "hel\x02lo\x02 world\n.lm 10\nline 2";
      store.saveContent("test-doc", raw);

      const result = await handleExport(store, "test-doc", "ws");
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("application/octet-stream");
      expect(result.body).toBe(raw);
      expect(result.filename).toBe("UNTITLED.ws");
    });

    it("sanitizes title into filename", async () => {
      store.create("test-doc");
      store.saveTitle("test-doc", "My Doc");
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "ws");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("My Doc.ws");
    });
  });

  describe("PDF export", () => {
    it("exports as pdf with correct content type", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "hello world");

      const result = await handleExport(store, "test-doc", "pdf");
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("application/pdf");
      expect(result.body instanceof Buffer).toBe(true);
      expect(result.filename).toBe("UNTITLED.pdf");
    });

    it("pdf starts with %PDF magic bytes", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "hello world");

      const result = await handleExport(store, "test-doc", "pdf");
      expect(result.status).toBe(200);
      expect(result.body instanceof Buffer).toBe(true);
      const pdf = result.body as Buffer;
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("pdf export includes document title", async () => {
      store.create("my-doc");
      store.saveContent("my-doc", "hello world");
      store.saveTitle("my-doc", "My Doc Title");

      const result = await handleExport(store, "my-doc", "pdf");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("My Doc Title.pdf");
    });
  });

  describe("content disposition", () => {
    it("includes attachment filename in response", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("UNTITLED.txt");
    });

    it("sanitizes filename: removes quotes", async () => {
      store.create("test-doc");
      store.saveTitle("test-doc", 'my "document" file');
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("my document file.txt");
    });

    it("sanitizes filename: removes path separators", async () => {
      store.create("test-doc");
      store.saveTitle("test-doc", "path/to/file");
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("pathtofile.txt");
    });

    it("sanitizes filename: removes control characters", async () => {
      store.create("test-doc");
      store.saveTitle("test-doc", "file\x00\x01\x02name");
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("filename.txt");
    });

    it("sanitizes filename: falls back to 'document' if empty after sanitization", async () => {
      store.create("test-doc");
      store.saveTitle("test-doc", '""""""'); // Only quotes
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("document.txt");
    });

    it("sanitizes filename: colon and other invalid chars", async () => {
      store.create("test-doc");
      store.saveTitle("test-doc", 'report:2024<data>|final?');
      store.saveContent("test-doc", "content");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.filename).toBe("report2024datafinal.txt");
    });
  });

  describe("multiline documents", () => {
    it("exports multiline text correctly", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "line 1\nline 2\nline 3");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.body).toBe("line 1\nline 2\nline 3\n");
    });

    it("handles empty lines", async () => {
      store.create("test-doc");
      store.saveContent("test-doc", "line 1\n\nline 3");

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.body).toBe("line 1\n\nline 3\n");
    });
  });

  describe("empty documents", () => {
    it("exports empty document as txt", async () => {
      store.create("test-doc");
      // Document starts empty

      const result = await handleExport(store, "test-doc", "txt");
      expect(result.status).toBe(200);
      expect(result.body).toBe("\n");
    });

    it("exports empty document as html", async () => {
      store.create("test-doc");

      const result = await handleExport(store, "test-doc", "html");
      expect(result.status).toBe(200);
      const html = result.body as string;
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("</html>");
    });
  });
});

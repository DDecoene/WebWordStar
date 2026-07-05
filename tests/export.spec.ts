import { test, expect } from "@playwright/test";
import { createReadStream } from "fs";
import { openEditor } from "./e2e-helpers";

/**
 * Helper to read a downloaded file as text.
 */
async function readDownloadAsText(downloadPath: string): Promise<string> {
  const chunks: string[] = [];
  const stream = createReadStream(downloadPath, { encoding: "utf-8" });
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: string | Buffer) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
    });
    stream.on("end", () => resolve(chunks.join("")));
    stream.on("error", reject);
  });
}

/**
 * Helper to read a downloaded file as a Buffer (for binary checks like PDF magic bytes).
 */
async function readDownloadAsBuffer(downloadPath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = createReadStream(downloadPath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: string | Buffer) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

test("^K P shows the PRINT/EXPORT prompt and Escape dismisses it", async ({
  page,
}) => {
  await openEditor(page);
  const status = page.getByTestId("status");

  // ^K P opens the export prompt
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");

  // The prompt should appear on the status bar
  await expect(status).toContainText("PRINT/EXPORT: P=PDF H=HTML T=Text M=Markdown W=WordStar");

  // Escape dismisses the prompt
  await page.keyboard.press("Escape");

  // Status bar should return to normal (no prompt)
  await expect(status).not.toContainText("PRINT/EXPORT");
});

test("^K P + T exports plain text: strips dot lines and control characters, preserves text content", async ({
  page,
}) => {
  await openEditor(page);
  const screen = page.getByTestId("screen");

  // Type a couple of lines
  await page.keyboard.type("First line of text");
  await page.keyboard.press("Enter");

  // Add a dot command line (should be stripped from export)
  await page.keyboard.type(".lm 5");
  await page.keyboard.press("Enter");

  // Type a bold run: ^P B bold ^P B
  await page.keyboard.type("Normal text with ");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type(" text");

  // Verify content on screen
  await expect(screen).toContainText("First line of text");
  await expect(screen).toContainText(".lm 5");
  await expect(screen).toContainText("bold");

  // Wait for debounced save to land
  await page.waitForTimeout(900);

  // Open export prompt and trigger text export
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("t");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);

  // Read and verify content
  const content = await readDownloadAsText(await download.path());

  // Should contain the text
  expect(content).toContain("First line of text");
  expect(content).toContain("Normal text with bold text");

  // Should NOT contain the dot line
  expect(content).not.toContain(".lm");

  // Should NOT contain the \x02 control character
  expect(content).not.toContain("\x02");
  expect(content).not.toContain("\x13");
  expect(content).not.toContain("\x19");
  expect(content).not.toContain("\x04");
});

test("^K P + M exports Markdown: bold runs as **text**, filename .md", async ({
  page,
}) => {
  await openEditor(page);
  const screen = page.getByTestId("screen");

  // Type text with bold
  await page.keyboard.type("This is ");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type("important");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type(" text");

  await expect(screen).toContainText("important");

  // Wait for debounced save
  await page.waitForTimeout(900);

  // Open export prompt and trigger Markdown export
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("m");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);

  // Read and verify content
  const content = await readDownloadAsText(await download.path());

  // Should contain the bold text as **word**
  expect(content).toContain("**important**");
  expect(content).toContain("This is");
  expect(content).toContain("text");
});

test("^K P + H exports HTML: <b> tags around bold, doctype, filename .html", async ({
  page,
}) => {
  await openEditor(page);
  const screen = page.getByTestId("screen");

  // Set a document title via ^K N
  await page.keyboard.press("Control+k");
  await page.keyboard.press("n");
  // Clear default and type title
  for (let i = 0; i < "UNTITLED".length; i++) {
    await page.keyboard.press("Backspace");
  }
  await page.keyboard.type("Test Export");
  await page.keyboard.press("Enter");

  // Type content with bold
  await page.keyboard.type("A test with ");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type(" content");

  await expect(screen).toContainText("bold");

  // Wait for debounced save (both content and title)
  await page.waitForTimeout(900);

  // Open export prompt and trigger HTML export
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("h");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);

  // Read and verify content
  const content = await readDownloadAsText(await download.path());

  // Should contain DOCTYPE
  expect(content.toUpperCase()).toContain("<!DOCTYPE");

  // Should contain HTML structure
  expect(content).toContain("<html");
  expect(content).toContain("</html>");

  // Should contain bold text wrapped in <b> tags
  expect(content).toMatch(/<b[^>]*>bold<\/b>/);

  // Should contain the plain text parts
  expect(content).toContain("A test with");
  expect(content).toContain("content");
});

test("^K P + P exports PDF: has %PDF magic bytes, filename .pdf", async ({
  page,
}) => {
  await openEditor(page);
  const screen = page.getByTestId("screen");

  // Type some content for the PDF
  await page.keyboard.type("This is PDF content");
  await page.keyboard.press("Enter");
  await page.keyboard.type("With a second line");

  await expect(screen).toContainText("PDF content");

  // Wait for debounced save
  await page.waitForTimeout(900);

  // Open export prompt and trigger PDF export
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("p");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  // Read and check for PDF magic bytes
  const buffer = await readDownloadAsBuffer(await download.path());
  const header = buffer.toString("ascii", 0, 4);

  expect(header).toBe("%PDF");
});

test("^K P + W exports native WordStar: preserves control chars and dot lines verbatim", async ({
  page,
}) => {
  await openEditor(page);
  const screen = page.getByTestId("screen");

  // Type a line with a print control (bold) and a dot command line
  await page.keyboard.type("Normal text with ");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type(" text");
  await page.keyboard.press("Enter");
  await page.keyboard.type(".lm 5");

  await expect(screen).toContainText("bold");
  await expect(screen).toContainText(".lm 5");

  // Wait for debounced save to land
  await page.waitForTimeout(900);

  // Open export prompt and trigger WordStar export
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("w");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.ws$/);

  // Read and verify content is the raw stored content, verbatim
  const content = await readDownloadAsText(await download.path());

  // Unlike .txt, the raw \x02 bold control character is preserved
  expect(content).toContain("\x02");
  // The dot line is preserved verbatim
  expect(content).toContain(".lm 5");
});

test("export respects document title in filename", async ({ page }) => {
  await openEditor(page);
  const status = page.getByTestId("status");

  // Set a custom document title via ^K N
  await page.keyboard.press("Control+k");
  await page.keyboard.press("n");
  // Clear default text
  for (let i = 0; i < "UNTITLED".length; i++) {
    await page.keyboard.press("Backspace");
  }
  await page.keyboard.type("MyLetter");
  await page.keyboard.press("Enter");

  await expect(status).toContainText("MyLetter");

  // Type some content
  await page.keyboard.type("Letter content");

  // Wait for save
  await page.waitForTimeout(900);

  // Export as text and check filename
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("t");

  const download = await downloadPromise;

  // Filename should include the custom title
  expect(download.suggestedFilename()).toBe("MyLetter.txt");
});

test("multiple exports in sequence work correctly", async ({ page }) => {
  await openEditor(page);

  // Type content
  await page.keyboard.type("Export test content");

  // Wait for save
  await page.waitForTimeout(900);

  // First export as text
  const downloadPromise1 = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("t");

  const download1 = await downloadPromise1;
  expect(download1.suggestedFilename()).toMatch(/\.txt$/);
  const content1 = await readDownloadAsText(await download1.path());
  expect(content1).toContain("Export test content");

  // Type more content
  await page.keyboard.press("Enter");
  await page.keyboard.type("Additional line");

  // Wait for save
  await page.waitForTimeout(900);

  // Second export as Markdown
  const downloadPromise2 = page.waitForEvent("download");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("p");
  await page.keyboard.press("m");

  const download2 = await downloadPromise2;
  expect(download2.suggestedFilename()).toMatch(/\.md$/);
  const content2 = await readDownloadAsText(await download2.path());
  expect(content2).toContain("Export test content");
  expect(content2).toContain("Additional line");
});

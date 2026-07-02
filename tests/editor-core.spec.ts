import { test, expect } from "@playwright/test";

test("word wrap and ^B reflow honor the right margin", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  // ^O R -> set a narrow right margin
  await page.keyboard.press("Control+o");
  await page.keyboard.press("r");
  await page.keyboard.type("20");
  await page.keyboard.press("Enter");

  await page.keyboard.type("The quick brown fox jumps over the lazy dog again");

  const wrappedText = await screen.textContent();
  const wrappedLines = (wrappedText ?? "").split("\n");
  expect(wrappedLines.length).toBeGreaterThan(1);
  // No wrapped line should exceed the margin (20 chars) plus the trailing flag cell.
  for (const line of wrappedLines) {
    expect(line.length).toBeLessThanOrEqual(22);
  }

  // Move into the paragraph and insert a word, then reflow with ^B.
  await page.keyboard.press("Control+q");
  await page.keyboard.press("r");
  await page.keyboard.type("Hey ");
  await page.keyboard.press("Control+b");

  const reflowedText = await screen.textContent();
  const reflowedLines = (reflowedText ?? "").split("\n");
  expect(reflowedLines.length).toBeGreaterThan(1);
  for (const line of reflowedLines) {
    expect(line.length).toBeLessThanOrEqual(22);
  }
  expect(reflowedText).toContain("Hey");
});

test("^O C centers a line and ^O T toggles the ruler", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");
  const ruler = page.getByTestId("ruler");

  await expect(ruler).toBeVisible();

  await page.keyboard.type("hi");
  await page.keyboard.press("Control+o");
  await page.keyboard.press("c");

  const centeredText = await screen.textContent();
  const firstLine = (centeredText ?? "").split("\n")[0] ?? "";
  expect(firstLine).toMatch(/^ +hi/);

  // ^O T hides the ruler
  await page.keyboard.press("Control+o");
  await page.keyboard.press("t");
  await expect(ruler).toHaveCount(0);

  // ^O T again brings it back
  await page.keyboard.press("Control+o");
  await page.keyboard.press("t");
  await expect(ruler).toBeVisible();
});

test("^P bold wraps text in a styled span with visible control markers, hideable via ^O D", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("hello ");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");
  await page.keyboard.type("world");
  await page.keyboard.press("Control+p");
  await page.keyboard.press("b");

  const boldSpan = screen.locator(".fmt-bold");
  await expect(boldSpan).toContainText("world");
  await expect(screen.locator(".ctrl")).toHaveCount(2);

  // ^O D toggles control-character display off
  await page.keyboard.press("Control+o");
  await page.keyboard.press("d");
  await expect(screen.locator(".ctrl")).toHaveCount(0);
  await expect(screen.locator(".fmt-bold")).toContainText("world");
});

test("self-revealing menus appear after a delay and respect the help level", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByTestId("menu");

  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1000);
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("BLOCK");

  // complete the command to dismiss the menu (mark block start; no visible change)
  await page.keyboard.press("b");
  await expect(menu).toHaveCount(0);

  // Lower the help level to 1 via ^J H
  await page.keyboard.press("Control+j");
  await page.keyboard.press("h");
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1000);
  await expect(menu).toHaveCount(0);
});

test("^U undoes a typing run and ^Q U redoes it", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("hello");
  await expect(screen).toContainText("hello");

  await page.keyboard.press("Control+u");
  await expect(screen).not.toContainText("hello");

  await page.keyboard.press("Control+q");
  await page.keyboard.press("u");
  await expect(screen).toContainText("hello");
});

test("^K V moves a marked block to the cursor position", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("abc def");

  // Mark block over "abc" (start of line to just before the space)
  await page.keyboard.press("Control+q");
  await page.keyboard.press("s");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("b");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("k");

  // Move cursor to end of line, then move the block there.
  await page.keyboard.press("Control+q");
  await page.keyboard.press("d");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("v");

  const text = await screen.textContent();
  expect(text).toContain("defabc");
  expect(text).not.toContain("abc def");
});

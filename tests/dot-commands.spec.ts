import { test, expect } from "@playwright/test";

test(".rm sets right margin and wraps subsequent text", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type(".rm 20");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The quick brown fox jumps over the lazy dog again");

  const text = await screen.textContent();
  const lines = (text ?? "").split("\n");
  expect(lines.length).toBeGreaterThan(1);
  expect(lines[0]).toContain(".rm 20");

  // No text line below the dot line should extend past column 20 (plus flag cell).
  for (const line of lines.slice(1)) {
    expect(line.length).toBeLessThanOrEqual(22);
  }
});

test(".pa forces a page break and advances the status PAGE number", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");
  const status = page.getByTestId("status");

  await page.keyboard.type(".pa");
  await page.keyboard.press("Enter");
  await page.keyboard.type("after");

  const pageBreak = screen.getByTestId("page-break");
  await expect(pageBreak).toBeVisible();

  await expect(status).toContainText("PAGE 2");
});

test("dot command lines render with a dot flag and dot styling", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type(".rm 20");

  const dotCell = screen.locator(".dot").first();
  await expect(dotCell).toBeVisible();

  const text = await screen.textContent();
  const firstLine = (text ?? "").split("\n")[0] ?? "";
  expect(firstLine.endsWith(".")).toBe(true);
});

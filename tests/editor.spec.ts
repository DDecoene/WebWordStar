import { test, expect } from "@playwright/test";

test("type, navigate with the diamond, and see the status line update", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");
  const status = page.getByTestId("status");

  await page.keyboard.type("Hello");
  await expect(screen).toContainText("Hello");
  await expect(status).toContainText("COL 6");

  // ^S moves left one character (the diamond)
  await page.keyboard.press("Control+s");
  await expect(status).toContainText("COL 5");

  // ^Q then D jumps to end of line
  await page.keyboard.press("Control+q");
  await page.keyboard.press("d");
  await expect(status).toContainText("COL 6");

  // Enter splits to a new line
  await page.keyboard.press("Enter");
  await expect(status).toContainText("LINE 2");
});

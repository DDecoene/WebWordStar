import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("typed content persists across a page reload", async ({ page }) => {
  const docId = randomUUID();
  await page.goto(`/?doc=${docId}`);
  await expect(page.getByTestId("status")).toBeVisible();

  await page.keyboard.type("Persistent text");
  await expect(page.getByTestId("screen")).toContainText("Persistent text");

  // Wait past the debounce so the save lands, then reload.
  await page.waitForTimeout(900);
  await page.reload();

  await expect(page.getByTestId("screen")).toContainText("Persistent text");
});

test("a document title set via ^KN persists across reload", async ({ page }) => {
  const docId = randomUUID();
  await page.goto(`/?doc=${docId}`);
  await expect(page.getByTestId("status")).toBeVisible();

  // ^K N opens the DOCUMENT NAME prompt (pre-filled "UNTITLED").
  await page.keyboard.press("Control+k");
  await page.keyboard.press("n");
  // Clear the pre-filled text, then type a new title.
  for (let i = 0; i < "UNTITLED".length; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type("My Letter");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("status")).toContainText("My Letter");

  await page.waitForTimeout(300);
  await page.reload();

  await expect(page.getByTestId("status")).toContainText("My Letter");
});

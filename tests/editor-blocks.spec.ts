import { test, expect } from "@playwright/test";

test("mark a block, copy it to end of line, and see it duplicated", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("abc");
  // ^Q S -> start of line, mark block begin
  await page.keyboard.press("Control+q");
  await page.keyboard.press("s");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("b");
  // ^Q D -> end of line, mark block end
  await page.keyboard.press("Control+q");
  await page.keyboard.press("d");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("k");
  // cursor already at end of line; copy block here
  await page.keyboard.press("Control+k");
  await page.keyboard.press("c");

  await expect(screen).toContainText("abcabc");
});

test("mark a block and delete it", async ({ page }) => {
  await page.goto("/");
  const screen = page.getByTestId("screen");

  await page.keyboard.type("hello");
  // mark from start
  await page.keyboard.press("Control+q");
  await page.keyboard.press("s");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("b");
  // move right twice (^D ^D) and mark end -> block covers "he"
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("k");
  // delete block
  await page.keyboard.press("Control+k");
  await page.keyboard.press("y");

  await expect(screen).toContainText("llo");
});

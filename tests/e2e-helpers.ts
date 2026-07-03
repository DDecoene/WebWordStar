import { expect, type Page } from "@playwright/test";

/** Open a fresh document and wait until the editor is interactive.
 * The initial paint happens after the keydown listener is attached, so once the
 * status bar is rendered it is safe to start typing (guards against keystrokes
 * being lost during the redirect/boot race). */
export async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForURL(/\?doc=/);
  await expect(page.getByTestId("status")).toContainText("PAGE");
}
